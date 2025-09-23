document.addEventListener('DOMContentLoaded', main);

// --- CONFIGURATION ---
const GIST_RAW_URL = 'https://gist.githubusercontent.com/Thomas-Marchand/427d44e917d26d6073378d81db84d5b2/raw/calendar_events.json';
const START_HOUR = 6;
const END_HOUR = 21;
const MIN_HOUR_HEIGHT = 60;
const GROUP_SPECIFIC_COLORS = {
    "M2": "#eb0909",
    "M2_ANDROIDE": "#bf1e9a",
    "MOSIMA": "#83d45b",
    "AI-ADAPT": "#3498db",
    "COCOMA": "#becc29",
    "MADMC": "#f1c40f",
    "MAOA": "#e67e22",
    "AOTJ": "#e74c3c",
    "MADI": "#ff365a",
    "HAII": "#b368de",
    "IAR": "#1f804f",
    "OIP Gr1": "#ab1f8d",
    "OIP Gr2": "#ab1f9d",
    "OIP Gr3": "#ab1fad",
};
const STALE_THRESHOLD_HOUR = 24;
const MOBILE_BREAKPOINT = 768;

// --- Global State ---
let allEvents = [], groupColors = {}, selectedGroups = [], scrapeMetadata = {}, currentDateOffset = 0, lastUpdatedInterval, currentTimeInterval;
let maxDataOffset = 0;
let nextBtnOriginalContent = '';
let allUniqueGroups = [];
let currentView = 'daily'; // 'daily' or 'weekly'
let touchStartX, touchStartY, touchStartTime = 0;
let isStalePopupShown = false;

// --- DOM Elements ---
const sidebar = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const calendarContainer = document.querySelector('.calendar-container');
const todayBtn = document.getElementById('today-btn');
const dailyViewBtn = document.getElementById('daily-view-btn');
const weeklyViewBtn = document.getElementById('weekly-view-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const lastUpdatedElement = document.getElementById('last-updated');
const collapsedSidebarInfo = document.getElementById('collapsed-sidebar-info');
// Popups
const instructionPopupOverlay = document.getElementById('instruction-popup-overlay');
const instructionPopupBox = document.getElementById('instruction-popup-box');
const instructionPopupCloseBtn = document.getElementById('instruction-popup-close-btn');
const stalePopupOverlay = document.getElementById('stale-popup-overlay');
const stalePopupBox = document.getElementById('stale-popup-box');
const stalePopupCloseBtn = document.getElementById('stale-popup-close-btn');
const eventDetailOverlay = document.getElementById('event-detail-overlay');
const eventDetailBox = document.getElementById('event-detail-box');
const eventDetailCloseBtn = document.getElementById('event-detail-close-btn');
const eventDetailTitle = document.getElementById('event-detail-title');
const eventDetailGroup = document.getElementById('event-detail-group');
const eventDetailDate = document.getElementById('event-detail-date');
const eventDetailTime = document.getElementById('event-detail-time');
const eventDetailLocation = document.getElementById('event-detail-location');


async function main() {
    // Store the initial HTML of the next button to preserve the arrow icon
    nextBtnOriginalContent = nextBtn.innerHTML;

    // Event Listeners
    todayBtn.addEventListener('click', goToToday);
    prevBtn.addEventListener('click', navigatePrevious);
    nextBtn.addEventListener('click', navigateNext);
    sidebarToggleBtn.addEventListener('click', toggleSidebar);
    dailyViewBtn.addEventListener('click', () => switchView('daily'));
    weeklyViewBtn.addEventListener('click', () => switchView('weekly'));
    
    // Popup Listeners
    stalePopupOverlay.addEventListener('click', hideStalePopup);
    stalePopupBox.addEventListener('click', (e) => e.stopPropagation());
    stalePopupCloseBtn.addEventListener('click', hideStalePopup);
    eventDetailCloseBtn.addEventListener('click', hideEventDetail);
    eventDetailOverlay.addEventListener('click', hideEventDetail);
    eventDetailBox.addEventListener('click', (e) => e.stopPropagation());
    instructionPopupOverlay.addEventListener('click', hideInstructionPopup);
    instructionPopupBox.addEventListener('click', (e) => e.stopPropagation());
    instructionPopupCloseBtn.addEventListener('click', hideInstructionPopup);

    // Interaction Listeners
    calendarContainer.addEventListener('touchstart', handleTouchStart, false);
    calendarContainer.addEventListener('touchend', handleTouchEnd, false);
    document.addEventListener('keydown', handleKeyPress);

    initializeSidebarState();
    initializeViewState();

    try {
    await loadAndProcessCalendarData();
    document.getElementById('loading-indicator').style.display = 'none';

    // Calculate the maximum navigation offset based on the last event's date
    if (allEvents.length > 0) {
        // Find the event with the latest start date in the entire dataset
        const lastEvent = allEvents.reduce((latest, current) => {
            const latestDate = new Date(latest.sd.split('/').reverse().join('-'));
            const currentDate = new Date(current.sd.split('/').reverse().join('-'));
            return currentDate > latestDate ? current : latest;
        });

        // Calculate the number of days between today and the last event
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const lastDate = new Date(lastEvent.sd.split('/').reverse().join('-'));
        maxDateOffset = Math.floor((lastDate - today) / (1000 * 60 * 60 * 24));
    } else {
        maxDateOffset = 0; // No events, no offset
    }

        initializeGroups();
        renderCalendar();
        setupLastUpdatedTimer();
        setupCurrentTimeTimer();
        scrollToCurrentTime();

        if (!localStorage.getItem('calendarVisited')) {
            instructionPopupOverlay.classList.remove('hidden');
        }

    } catch (error)
    {
        document.getElementById('loading-indicator').innerText = 'Failed to load calendar data.';
        console.error('Failed to initialize calendar:', error);
    }
}

// --- Utility Functions ---
function dateToYyyyMmDdString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function getRandomColor(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    const color = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return "#" + "00000".substring(0, 6 - color.length) + color;
}
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function timeToMinutes(timeStr) {
    if (typeof timeStr !== 'string' || !timeStr.includes(':')) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}
function parseDateInt(dateInt) {
    const dateStr = String(dateInt).padStart(6, '0');
    const day = dateStr.substring(0, 2);
    const month = dateStr.substring(2, 4);
    const year = "20" + dateStr.substring(4, 6);
    return `${day}/${month}/${year}`;
}
function parseTimeInt(timeInt) {
    const timeStr = String(timeInt).padStart(4, '0');
    const hours = timeStr.substring(0, 2);
    const minutes = timeStr.substring(2, 4);
    return `${hours}:${minutes}`;
}
function decompressEvents(data) {
    const { schema, events: compressedEvents, meta } = data;
    const groupNames = meta.c;

    // map for faster schema lookups
    const schemaMap = {};
    schema.forEach((key, index) => {
        schemaMap[key] = index;
    });

    return compressedEvents.map(eventArray => {
        const event = {
            sd: parseDateInt(eventArray[schemaMap.d]),
            st: parseTimeInt(eventArray[schemaMap.st]),
            et: parseTimeInt(eventArray[schemaMap.et]),
            g: groupNames[eventArray[schemaMap.g]],
            t: eventArray[schemaMap.t],
            l: eventArray[schemaMap.l]
        };
        // optional end_date
        if (schemaMap.ed < eventArray.length) {
            event.ed = parseDateInt(eventArray[schemaMap.ed]);
        } else {
            event.ed = event.sd;
        }
        return event;
    });
}


// Initialization
function initializeSidebarState() {
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }
}
function initializeViewState() {
    const savedView = localStorage.getItem('calendarView');
    if (savedView === 'weekly') {
        currentView = 'weekly';
    }
    updateViewButtons();
}
function initializeGroups() {
    const groupList = document.getElementById('group-list');
    // allUniqueGroups = [...scrapeMetadata.c].sort();
    allUniqueGroups = [...scrapeMetadata.c].sort((a, b) => {
        const specialOrder = ["M2", "M2_ANDROIDE"];
        const aIsSpecial = specialOrder.includes(a);
        const bIsSpecial = specialOrder.includes(b);

        if (aIsSpecial && !bIsSpecial) {
            return -1; // a comes first
        }
        if (!aIsSpecial && bIsSpecial) {
            return 1; // b comes first
        }
        if (aIsSpecial && bIsSpecial) {
            // If both are special, sort them by their order in the specialOrder array
            return specialOrder.indexOf(a) - specialOrder.indexOf(b);
        }
        // Otherwise, sort alphabetically
        return a.localeCompare(b);
    });

    
    const savedGroups = JSON.parse(localStorage.getItem('selectedGroups'));
    // By default, select all available groups from the new metadata.
    const defaultSelection = allUniqueGroups; 
    
    // Use saved groups if they exist, otherwise use the new default.
    selectedGroups = savedGroups || defaultSelection;
    
    // If no groups were saved in localStorage, save the new default selection.
    if (!savedGroups) localStorage.setItem('selectedGroups', JSON.stringify(selectedGroups));

    
    allUniqueGroups.forEach(group => {
        groupColors[group] = GROUP_SPECIFIC_COLORS[group] || getRandomColor(group);
        const button = document.createElement('button');
        button.className = 'group-btn';
        button.textContent = group;
        button.dataset.group = group;
        button.style.backgroundColor = groupColors[group];
        if (!selectedGroups.includes(group)) {
            button.classList.add('inactive');
        }
        button.addEventListener('click', () => {
            button.classList.toggle('inactive');
            const groupName = button.dataset.group;
            if (button.classList.contains('inactive')) {
                selectedGroups = selectedGroups.filter(g => g !== groupName);
            } else {
                selectedGroups.push(groupName);
            }
            localStorage.setItem('selectedGroups', JSON.stringify(selectedGroups));
            updateColorIndicators();
            renderCalendar();
        });
        groupList.appendChild(button);
    });
    updateColorIndicators();
}

// Update functions
function updateViewButtons() {
    if (currentView === 'weekly') {
        weeklyViewBtn.classList.add('active');
        dailyViewBtn.classList.remove('active');
    } else {
        dailyViewBtn.classList.add('active');
        weeklyViewBtn.classList.remove('active');
    }
}
function updateNavButtonState() {
    prevBtn.disabled = (currentDateOffset <= 0);
    nextBtn.disabled = (currentDateOffset >= maxDateOffset);

    const period = currentView === 'weekly' ? 'Week' : 'Days';
    prevBtn.title = `Previous ${period} (←)`;
    nextBtn.title = `Next ${period} (→)`;
}

function updateColorIndicators() {
    const indicatorContainer = document.getElementById('group-color-indicators');
    indicatorContainer.innerHTML = ''; 

    allUniqueGroups.forEach(group => {
        const indicator = document.createElement('div');
        const isActive = selectedGroups.includes(group);

        if (isActive) {
            indicator.className = 'color-indicator';
            const color = groupColors[group] || '#ccc';
            indicator.style.backgroundColor = color;
            indicator.style.setProperty('--glow-color', hexToRgba(color, 0.7));
        } else {
            indicator.className = 'color-indicator inactive';
        }
        
        indicatorContainer.appendChild(indicator);
    });
}
function updateCurrentTimeIndicator() {
    document.querySelectorAll('.current-time-line').forEach(line => line.remove());

    const now = new Date();
    const todayStr = dateToYyyyMmDdString(now);
    const todayColumnTimeline = document.querySelector(`.day-column[data-date='${todayStr}'] .timeline`);

    if (!todayColumnTimeline) return;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const timelineStartMinutes = START_HOUR * 60;
    const timelineEndMinutes = END_HOUR * 60;

    if (currentMinutes < timelineStartMinutes || currentMinutes > timelineEndMinutes) return;

    const topPosition = ((currentMinutes - timelineStartMinutes) / 60) * calculateHourHeight();
    
    const timeLine = document.createElement('div');
    timeLine.className = 'current-time-line';
    timeLine.style.top = `${topPosition}px`;
    
    todayColumnTimeline.appendChild(timeLine);
}
function updateHeaderForDay(headerEl, date) {
    const isMobileWeekly = currentView === 'weekly' && window.innerWidth < MOBILE_BREAKPOINT;
    const options = { 
        weekday: isMobileWeekly ? undefined : 'short', 
        month: isMobileWeekly ? 'numeric' : 'short', 
        day: 'numeric' 
    };
    headerEl.textContent = date.toLocaleDateString(undefined, options);

    const todayStr = dateToYyyyMmDdString(new Date());
    if (dateToYyyyMmDdString(date) === todayStr) {
        headerEl.classList.add('today-header');
    }
}


async function loadAndProcessCalendarData() {
    const data = await fetchData(GIST_RAW_URL);
    allEvents = decompressEvents(data);
    scrapeMetadata = data.meta;
}

async function fetchData(url) {
    // const response = await fetch(url, { cache: 'reload' }); 
    const uniqueUrl = `${url}?t=${new Date().getTime()}`;
    const response = await fetch(uniqueUrl, { cache: 'reload' }); 
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
}

function renderCalendar() {
    calendarContainer.innerHTML = ''; 
    calendarContainer.classList.toggle('weekly-view', currentView === 'weekly');

    const daysToShow = currentView === 'weekly' ? 6 : 2;
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + currentDateOffset);

    let firstDayOfView = new Date(baseDate);
    if (currentView === 'weekly') {
        const dayOfWeek = firstDayOfView.getDay();
        if (dayOfWeek === 0 && currentDateOffset === 0) { // sunday and showing current week
            const difference = firstDayOfView.getDate() + 1; // next monday
            firstDayOfView.setDate(difference);
        } else {
            const difference = firstDayOfView.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // monday of the week
            firstDayOfView.setDate(difference);
        }
    }

    for (let i = 0; i < daysToShow; i++) {
        const dayDate = new Date(firstDayOfView);
        dayDate.setDate(dayDate.getDate() + i);
        const dayStr = dateToYyyyMmDdString(dayDate);

        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        dayColumn.dataset.date = dayStr;

        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        updateHeaderForDay(dayHeader, dayDate);

        const timeline = document.createElement('div');
        timeline.className = 'timeline';
        createTimelineHours(timeline);

        dayColumn.appendChild(dayHeader);
        dayColumn.appendChild(timeline);
        calendarContainer.appendChild(dayColumn);
        
        const eventsForDay = allEvents.filter(event => {
            const eventDate = event.sd.split('/').reverse().join('-');
            return selectedGroups.includes(event.g) && eventDate === dayStr;
        });
        renderDayEvents(eventsForDay, timeline);
    }
    
    updateNavButtonState();
    updateCurrentTimeIndicator();
}

function setupLastUpdatedTimer() {
    const update = () => {
        if (!scrapeMetadata.ts) return;
        const scrapedDate = new Date(scrapeMetadata.ts);
        const now = new Date();
        const diffMinutes = Math.round((now - scrapedDate) / (1000 * 60));
        
        let textContent = '';
        if (diffMinutes < 1) { textContent = 'Last update: just now'; }
        else if (diffMinutes < 60) { textContent = `Last update: ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`; }
        else { const diffHours = Math.floor(diffMinutes / 60); textContent = `Last update: ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`; }
        
        lastUpdatedElement.textContent = textContent;
        collapsedSidebarInfo.textContent = textContent;

        checkDataFreshness();
    };
    update();
    if (lastUpdatedInterval) clearInterval(lastUpdatedInterval);
    lastUpdatedInterval = setInterval(update, 60000);
}

function setupCurrentTimeTimer() {
    updateCurrentTimeIndicator();
    if (currentTimeInterval) clearInterval(currentTimeInterval);
    currentTimeInterval = setInterval(updateCurrentTimeIndicator, 60000);
}

function scrollToCurrentTime() {
    const timeLine = document.querySelector('.current-time-line');
    if (!timeLine) {
        return;
    }
    const calendarContainer = document.querySelector('.calendar-container');
    const timeLinePosition = timeLine.offsetTop;
    const containerVisibleHeight = calendarContainer.clientHeight;
    const containerScrollTop = calendarContainer.scrollTop;
    const isBelowView = timeLinePosition > (containerScrollTop + containerVisibleHeight - 50);
    if (isBelowView) {
        timeLine.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
}


function switchView(newView) {
    if (newView === currentView) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newOffset = currentDateOffset;

    if (newView === 'weekly') {
        const currentDay = new Date();
        currentDay.setDate(currentDay.getDate() + currentDateOffset);
        currentDay.setHours(0, 0, 0, 0);
        const dayOfWeek = currentDay.getDay();
        const difference = currentDay.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const mondayOfWeek = new Date(currentDay.setDate(difference));
        newOffset = Math.round((mondayOfWeek - today) / (1000 * 60 * 60 * 24));
    } else if (newView === 'daily') {
        const weekStartDate = new Date();
        weekStartDate.setDate(weekStartDate.getDate() + currentDateOffset);
        const dayOfWeek = weekStartDate.getDay();
        const difference = weekStartDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const mondayOfWeek = new Date(weekStartDate.setDate(difference));
        let targetDay = new Date(mondayOfWeek);

        const weekDateStrings = [];
        for (let i = 0; i < 6; i++) {
            const d = new Date(mondayOfWeek);
            d.setDate(d.getDate() + i);
            weekDateStrings.push(d.toISOString().split('T')[0].split('-').reverse().join('/'));
        }

        const eventsInWeek = allEvents
            .filter(e => selectedGroups.includes(e.g) && weekDateStrings.includes(e.sd))
            .sort((a,b) => a.sd.split('/').reverse().join('-').localeCompare(b.sd.split('/').reverse().join('-')));

        if (eventsInWeek.length > 0) {
            const [day, month, year] = eventsInWeek[0].sd.split('/');
            targetDay = new Date(year, month - 1, day);
        }
        newOffset = Math.round((targetDay - today) / (1000 * 60 * 60 * 24));
    }

    // Use the correct GLOBAL maxDataOffset variable for clamping the value.
    currentDateOffset = Math.max(0, Math.min(newOffset, maxDataOffset));
    currentView = newView;
    localStorage.setItem('calendarView', newView);
    updateViewButtons();
    renderCalendar();
}

function handleTouchStart(evt) {
    const firstTouch = evt.touches[0];
    touchStartX = firstTouch.clientX;
    touchStartY = firstTouch.clientY;
    touchStartTime = new Date().getTime();
}

function handleTouchEnd(evt) {
    const endTouch = evt.changedTouches[0];
    const touchEndX = endTouch.clientX;
    const touchEndY = endTouch.clientY;
    const touchEndTime = new Date().getTime();
    const elapsedTime = touchEndTime - touchStartTime;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    const swipeThreshold = 40; // Minimum distance in pixels
    const swipeLeniency = 0.7; // Ratio to distinguish horizontal vs vertical swipe
    const swipeDuration = 700; // Maximum duration for a swipe in ms
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) * swipeLeniency;
    const isSwipeFast = elapsedTime < swipeDuration;

    if (isHorizontalSwipe && isSwipeFast && Math.abs(deltaX) > swipeThreshold) {
        if (deltaX < 0) {
            if (!nextBtn.disabled) {
                navigateNext();
                triggerSwipeAnimation();
            }
        } else {
            if (!prevBtn.disabled) {
                navigatePrevious();
                triggerSwipeAnimation();
            }
        }
    }
}

function handleKeyPress(event) {
    if (event.key === 'ArrowRight') {
        if (!nextBtn.disabled) {
            navigateNext();
            triggerSwipeAnimation();
        }
    } else if (event.key === 'ArrowLeft') {
        if (!prevBtn.disabled) {
            navigatePrevious();
            triggerSwipeAnimation();
        }
    } else if (event.key === 'd' || event.key === 'D') {
        switchView('daily');
    } else if (event.key === 'w' || event.key === 'W') {
        switchView('weekly');
    } else if (event.key === 'Tab') {
        event.preventDefault();
        toggleSidebar();
    } else if (event.key === ' ') {
        event.preventDefault();
        goToToday();
    } else if (event.key === 'Escape') {
        hideStalePopup();
        hideEventDetail();
        hideInstructionPopup();
    }
}

function toggleGroupByIndex(groupIndex) {
    const groupName = allUniqueGroups[groupIndex];
    const groupButton = document.querySelector(`[data-group="${groupName}"]`);
    
    if (!groupButton) return; // Group button not found
    
    // Toggle the group state
    groupButton.classList.toggle('inactive');
    
    if (groupButton.classList.contains('inactive')) {
        // Remove from selected groups
        selectedGroups = selectedGroups.filter(g => g !== groupName);
    } else {
        // Add to selected groups
        selectedGroups.push(groupName);
    }
    
    // Save to localStorage and update UI
    localStorage.setItem('selectedGroups', JSON.stringify(selectedGroups));
    updateColorIndicators();
    renderCalendar();
}

function triggerSwipeAnimation() {
    const headers = document.querySelectorAll('.day-header');
    headers.forEach(header => {
        header.classList.add('swiped');
    });
    setTimeout(() => {
        headers.forEach(header => {
            header.classList.remove('swiped');
        });
    }, 200); // match the animation duration in CSS : .day-header.swiped
}

function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
}

function showStalePopup() {
    stalePopupOverlay.classList.remove('hidden');
}

function hideStalePopup() {
    stalePopupOverlay.classList.add('hidden');
}

function hideInstructionPopup() {
    instructionPopupOverlay.classList.add('hidden');
    localStorage.setItem('calendarVisited', 'true');
}

function showEventDetail(event, clickedElement) {
    if (!event) return;
    const [day, month, year] = event.sd.split('/');
    const eventDate = new Date(year, month - 1, day);
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

    eventDetailTitle.textContent = event.t;
    eventDetailGroup.textContent = `Group: ${event.g}`;
    eventDetailDate.textContent = eventDate.toLocaleDateString(undefined, dateOptions);
    eventDetailTime.textContent = `${event.st} - ${event.et}`;
    eventDetailLocation.textContent = event.l || 'No location specified';

    const color = groupColors[event.g] || '#888';
    eventDetailBox.style.borderTopColor = color;
    eventDetailGroup.style.color = color;

    // position popup (fixed positioning relative to viewport)
    if (clickedElement) {
        const rect = clickedElement.getBoundingClientRect();
        const popupWidth = 320;
        const popupHeight = 200;
        
        let left = rect.right + 10;
        let top = rect.top;
        
        // adjust if off screen
        if (left + popupWidth > window.innerWidth) {
            left = rect.left - popupWidth - 10;
        }
        if (left < 10) {
            left = 10;
        }
        if (top + popupHeight > window.innerHeight) {
            top = window.innerHeight - popupHeight - 10;
        }
        if (top < 10) {
            top = 10;
        }
        
        eventDetailBox.style.left = `${left}px`;
        eventDetailBox.style.top = `${top}px`;
    }

    // Show both overlay and box independently
    eventDetailOverlay.classList.remove('hidden');
    eventDetailBox.classList.remove('hidden');
    // animate in
    requestAnimationFrame(() => {
        eventDetailBox.style.transform = 'scale(1)';
    });
}

function hideEventDetail() {
    eventDetailOverlay.classList.add('hidden');
    eventDetailBox.classList.add('hidden');
    // reset transform for next open
    eventDetailBox.style.transform = 'scale(0.9)';
}

function checkDataFreshness() {
    if (!scrapeMetadata.ts) return;
    const scrapedDate = new Date(scrapeMetadata.ts);
    const now = new Date();
    const diffHours = (now - scrapedDate) / (1000 * 60 * 60);

    if (diffHours > STALE_THRESHOLD_HOUR) {
        lastUpdatedElement.classList.add('stale-data');
        collapsedSidebarInfo.classList.add('stale-data');
        if (!isStalePopupShown) {
            showStalePopup();
            isStalePopupShown = true;
        }
    } else {
        lastUpdatedElement.classList.remove('stale-data');
        collapsedSidebarInfo.classList.remove('stale-data');
        isStalePopupShown = false;
    }
}


function calculateHourHeight() {
    const availableHeight = window.innerHeight - 41; // header height
    const totalHours = END_HOUR - START_HOUR;
    return Math.max(MIN_HOUR_HEIGHT, availableHeight / totalHours);
}

function createTimelineHours(timeline) {
    const HOUR_HEIGHT = calculateHourHeight();
    const timelineHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
    timeline.style.height = `${timelineHeight}px`;

    for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
        const topPos = (hour - START_HOUR) * HOUR_HEIGHT;
        const line = document.createElement('div');
        line.className = 'hour-line';
        line.style.top = `${topPos}px`;
        timeline.appendChild(line);

        if (hour > START_HOUR && hour < END_HOUR) {
            const label = document.createElement('div');
            label.className = 'hour-label';
            label.textContent = `${hour}:00`;
            label.style.top = `${topPos}px`;
            timeline.appendChild(label);
        }
    }
}

function renderDayEvents(dayEvents, timelineElement) {
    if (!dayEvents.length) return;

    const HOUR_HEIGHT = calculateHourHeight();
    const events = dayEvents
        .map(event => {
            const startMinutes = timeToMinutes(event.st);
            const endMinutes = timeToMinutes(event.et);
            if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;
            return {
                ...event,
                startMinutes,
                endMinutes,
                top: ((startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT,
                height: ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.startMinutes - b.startMinutes);

    const collisionBlocks = [];
    if (events.length > 0) {
        let currentBlock = [events[0]];
        collisionBlocks.push(currentBlock);
        let maxEndTimeInBlock = events[0].endMinutes;

        for (let i = 1; i < events.length; i++) {
            const event = events[i];
            if (event.startMinutes >= maxEndTimeInBlock) {
                currentBlock = [event];
                collisionBlocks.push(currentBlock);
                maxEndTimeInBlock = event.endMinutes;
            } else {
                currentBlock.push(event);
                maxEndTimeInBlock = Math.max(maxEndTimeInBlock, event.endMinutes);
            }
        }
    }

    for (const block of collisionBlocks) {
        block.sort((a, b) => a.startMinutes - b.startMinutes);
        const columns = [];
        for (const event of block) {
            let placed = false;
            for (const col of columns) {
                if (event.startMinutes >= col[col.length - 1].endMinutes) {
                    col.push(event);
                    event.colIndex = columns.indexOf(col);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                columns.push([event]);
                event.colIndex = columns.length - 1;
            }
        }
        for (const event of block) {
            event.totalColumns = columns.length;
        }
    }

    for (const event of events) {
        const eventBlock = document.createElement('div');
        eventBlock.className = 'event-block';
        
        const width = 100 / event.totalColumns;
        eventBlock.style.width = `calc(${width}% - 5px)`;
        eventBlock.style.left = `${event.colIndex * width}%`;
        eventBlock.style.top = `${event.top}px`;
        eventBlock.style.height = `${Math.max(20, event.height - 2)}px`;
        
        const color = groupColors[event.g] || '#ccc';
        eventBlock.style.backgroundColor = hexToRgba(color, 0.5);
        eventBlock.style.borderColor = color;
        eventBlock.style.setProperty('--glow-color', hexToRgba(color, 0.7));

        const isMobileWeekly = currentView === 'weekly' && window.innerWidth < MOBILE_BREAKPOINT;
        if (isMobileWeekly) {
            const locationText = event.l || 'N/A';
            const verticalText = locationText.split('').join('<br>');
            eventBlock.innerHTML = `<p class="event-title">${verticalText}</p>`;
            eventBlock.style.fontSize = '10px';
            eventBlock.style.lineHeight = '1.1';
            eventBlock.style.textAlign = 'center';
            eventBlock.style.padding = '4px 2px';
        } else {
            eventBlock.innerHTML = `<p class="event-title">${event.t}</p><p>${event.st} - ${event.et}</p><p>${event.l}</p>`;
        }
        
        eventBlock.addEventListener('click', (e) => {
            e.stopPropagation();
            showEventDetail(event, eventBlock);
        });
        timelineElement.appendChild(eventBlock);
    }
}

function navigateNext() {
    const increment = currentView === 'weekly' ? 7 : 2;
    currentDateOffset += increment;
    renderCalendar();
}
function navigatePrevious() {
    const increment = currentView === 'weekly' ? 7 : 2;
    currentDateOffset -= increment;
    renderCalendar();
}
function goToToday() {
    currentDateOffset = 0;
    renderCalendar();
    scrollToCurrentTime();
}

// Refresh data when tab becomes visible
document.addEventListener('visibilitychange', async function () {
    if (document.visibilityState === 'visible') {
        try {
            await loadAndProcessCalendarData();
            renderCalendar();
            setupLastUpdatedTimer();
            updateCurrentTimeIndicator();
        } catch (error) {
            console.error('Failed to refresh calendar data:', error);
        }
    }
});