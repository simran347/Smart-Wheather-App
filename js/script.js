const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
const RECENT_SEARCHES_KEY = 'skycast-recent-searches';

const elements = {
    searchForm: document.getElementById('search-form'),
    cityInput: document.getElementById('city-input'),
    locationButton: document.getElementById('location-button'),
    unitToggle: document.getElementById('unit-toggle'),
    recentSearches: document.getElementById('recent-searches'),
    status: document.getElementById('status-message'),
    weatherContent: document.getElementById('weather-content'),
    currentDate: document.getElementById('current-date'),
    cityName: document.getElementById('city-name'),
    condition: document.getElementById('condition'),
    currentIcon: document.getElementById('current-icon'),
    temperature: document.getElementById('temperature'),
    feelsLike: document.getElementById('feels-like'),
    localTime: document.getElementById('local-time'),
    humidity: document.getElementById('humidity'),
    wind: document.getElementById('wind'),
    rainChance: document.getElementById('rain-chance'),
    sunrise: document.getElementById('sunrise'),
    hourlyForecast: document.getElementById('hourly-forecast'),
    dailyForecast: document.getElementById('daily-forecast')
};

const weatherDescriptions = new Map([
    [0, 'Clear sky'],
    [1, 'Mainly clear'],
    [2, 'Partly cloudy'],
    [3, 'Overcast'],
    [45, 'Fog'],
    [48, 'Rime fog'],
    [51, 'Light drizzle'],
    [53, 'Drizzle'],
    [55, 'Heavy drizzle'],
    [56, 'Freezing drizzle'],
    [57, 'Heavy freezing drizzle'],
    [61, 'Light rain'],
    [63, 'Rain'],
    [65, 'Heavy rain'],
    [66, 'Freezing rain'],
    [67, 'Heavy freezing rain'],
    [71, 'Light snow'],
    [73, 'Snow'],
    [75, 'Heavy snow'],
    [77, 'Snow grains'],
    [80, 'Light showers'],
    [81, 'Rain showers'],
    [82, 'Heavy showers'],
    [85, 'Snow showers'],
    [86, 'Heavy snow showers'],
    [95, 'Thunderstorm'],
    [96, 'Thunderstorm with hail'],
    [99, 'Heavy thunderstorm']
]);

let useFahrenheit = false;
let currentRequest = 0;
let latestForecast = null;
let latestLabel = '';

function weatherIcon(code, isDay = true) {
    if (code === 0) return isDay ? '☀️' : '🌙';
    if (code === 1 || code === 2) return isDay ? '⛅' : '☁️';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
    if ([95, 96, 99].includes(code)) return '⛈️';
    return '🌤️';
}

function describeWeather(code) {
    return weatherDescriptions.get(code) || 'Weather unavailable';
}

function displayTemperature(celsius) {
    const value = useFahrenheit ? (celsius * 9 / 5) + 32 : celsius;
    return `${Math.round(value)}°`;
}

function formatHour(dateTime) {
    const time = dateTime.split('T')[1];
    if (!time) return '--';
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(date);
}

function formatWeekday(dateString, index) {
    if (index === 0) return 'Today';
    const date = new Date(`${dateString}T12:00:00Z`);
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' }).format(date);
}

function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle('is-error', isError);
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Weather service returned ${response.status}. Please try again.`);
    }
    return response.json();
}

async function findCity(query) {
    const url = new URL(GEOCODING_API);
    url.search = new URLSearchParams({
        name: query,
        count: '1',
        language: 'en',
        format: 'json'
    });
    const data = await fetchJson(url);
    if (!data.results || data.results.length === 0) {
        throw new Error(`We couldn't find "${query}". Check the spelling and try again.`);
    }
    return data.results[0];
}

async function getForecast(latitude, longitude) {
    const url = new URL(WEATHER_API);
    url.search = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
        hourly: 'temperature_2m,precipitation_probability,weather_code',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
        forecast_days: '5',
        timezone: 'auto',
        wind_speed_unit: 'kmh'
    });
    return fetchJson(url);
}

function cityLabel(city) {
    return [city.name, city.admin1, city.country]
        .filter((part, index, parts) => part && parts.indexOf(part) === index)
        .join(', ');
}

function buildHourlyForecast(data) {
    const { hourly, current } = data;
    const startIndex = Math.max(0, hourly.time.findIndex(time => time >= current.time));
    const endIndex = startIndex === -1 ? 8 : startIndex + 8;
    elements.hourlyForecast.replaceChildren();

    hourly.time.slice(startIndex, endIndex).forEach((time, offset) => {
        const index = startIndex + offset;
        const card = document.createElement('article');
        card.className = 'hour-card';

        const timeLabel = document.createElement('span');
        timeLabel.className = 'hour-time';
        timeLabel.textContent = offset === 0 ? 'Now' : formatHour(time);

        const icon = document.createElement('span');
        icon.className = 'hour-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = weatherIcon(hourly.weather_code[index]);

        const temperature = document.createElement('span');
        temperature.className = 'hour-temp';
        temperature.textContent = displayTemperature(hourly.temperature_2m[index]);

        const rain = document.createElement('span');
        rain.className = 'hour-rain';
        rain.textContent = `${hourly.precipitation_probability[index] ?? 0}% rain`;

        card.append(timeLabel, icon, temperature, rain);
        elements.hourlyForecast.append(card);
    });
}

function buildDailyForecast(data) {
    const { daily } = data;
    elements.dailyForecast.replaceChildren();

    daily.time.forEach((date, index) => {
        const row = document.createElement('div');
        row.className = 'daily-row';

        const day = document.createElement('span');
        day.className = 'daily-day';
        day.textContent = formatWeekday(date, index);

        const condition = document.createElement('span');
        condition.className = 'daily-condition';
        const icon = document.createElement('span');
        icon.className = 'daily-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = weatherIcon(daily.weather_code[index]);
        const description = document.createElement('span');
        description.textContent = describeWeather(daily.weather_code[index]);
        condition.append(icon, description);

        const rain = document.createElement('span');
        rain.className = 'daily-rain';
        rain.textContent = `${daily.precipitation_probability_max[index] ?? 0}% rain`;

        const temperatures = document.createElement('span');
        temperatures.className = 'daily-temps';
        const high = document.createElement('span');
        high.textContent = displayTemperature(daily.temperature_2m_max[index]);
        const low = document.createElement('span');
        low.className = 'daily-low';
        low.textContent = displayTemperature(daily.temperature_2m_min[index]);
        temperatures.append(high, low);

        row.append(day, condition, rain, temperatures);
        elements.dailyForecast.append(row);
    });
}

function renderForecast(data, label) {
    latestForecast = data;
    latestLabel = label;
    const { current, daily, timezone } = data;
    const timestamp = new Date();
    const dateOptions = { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone };
    const timeOptions = { hour: 'numeric', minute: '2-digit', timeZone: timezone };
    const dayIndex = Math.max(0, daily.time.indexOf(current.time.slice(0, 10)));

    elements.cityName.textContent = label;
    elements.currentDate.textContent = new Intl.DateTimeFormat(undefined, dateOptions).format(timestamp);
    elements.condition.textContent = describeWeather(current.weather_code);
    elements.currentIcon.textContent = weatherIcon(current.weather_code, Boolean(current.is_day));
    elements.temperature.innerHTML = `${displayTemperature(current.temperature_2m).replace('°', '')}<sup>°${useFahrenheit ? 'F' : 'C'}</sup>`;
    elements.feelsLike.textContent = displayTemperature(current.apparent_temperature);
    elements.localTime.textContent = `Local time ${new Intl.DateTimeFormat(undefined, timeOptions).format(timestamp)}`;
    elements.humidity.textContent = `${current.relative_humidity_2m}%`;
    elements.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    elements.rainChance.textContent = `${daily.precipitation_probability_max[dayIndex] ?? 0}%`;
    elements.sunrise.textContent = daily.sunrise[dayIndex]?.split('T')[1]?.slice(0, 5) || '--:--';
    buildHourlyForecast(data);
    buildDailyForecast(data);
    elements.weatherContent.hidden = false;
}

function readRecentSearches() {
    try {
        const value = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
        return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 4) : [];
    } catch (error) {
        console.warn('Could not read saved recent searches.', error);
        return [];
    }
}

function saveRecentSearch(name) {
    const searches = [name, ...readRecentSearches().filter(item => item.toLowerCase() !== name.toLowerCase())].slice(0, 4);
    try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
    } catch (error) {
        console.warn('Could not save recent searches.', error);
    }
    renderRecentSearches();
}

function renderRecentSearches() {
    elements.recentSearches.replaceChildren();
    readRecentSearches().forEach(name => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'recent-chip';
        button.textContent = name;
        button.addEventListener('click', () => loadCity(name));
        elements.recentSearches.append(button);
    });
}

async function loadCity(query) {
    const cityName = query.trim();
    if (!cityName) {
        setStatus('Enter a city name to search.', true);
        return;
    }

    const requestId = ++currentRequest;
    elements.locationButton.disabled = true;
    setStatus(`Finding weather for ${cityName}...`);

    try {
        const city = await findCity(cityName);
        const forecast = await getForecast(city.latitude, city.longitude);
        if (requestId !== currentRequest) return;
        const label = cityLabel(city);
        renderForecast(forecast, label);
        saveRecentSearch(city.name);
        elements.cityInput.value = '';
        setStatus(`Updated just now · ${label}`);
    } catch (error) {
        if (requestId !== currentRequest) return;
        setStatus(error instanceof Error ? error.message : 'Could not load the weather. Please try again.', true);
    } finally {
        if (requestId === currentRequest) elements.locationButton.disabled = false;
    }
}

async function loadCurrentLocation() {
    if (!navigator.geolocation) {
        setStatus('Location access is not available in this browser.', true);
        return;
    }

    const requestId = ++currentRequest;
    elements.locationButton.disabled = true;
    setStatus('Finding your location...');
    navigator.geolocation.getCurrentPosition(async position => {
        try {
            const forecast = await getForecast(position.coords.latitude, position.coords.longitude);
            if (requestId !== currentRequest) return;
            renderForecast(forecast, 'Your location');
            setStatus('Showing weather near your current location.');
        } catch (error) {
            if (requestId !== currentRequest) return;
            setStatus(error instanceof Error ? error.message : 'Could not load local weather.', true);
        } finally {
            if (requestId === currentRequest) elements.locationButton.disabled = false;
        }
    }, error => {
        if (requestId !== currentRequest) return;
        const message = error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Search for a city instead.'
            : 'Could not determine your location. Please try again.';
        setStatus(message, true);
        elements.locationButton.disabled = false;
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

elements.searchForm.addEventListener('submit', event => {
    event.preventDefault();
    loadCity(elements.cityInput.value);
});

elements.locationButton.addEventListener('click', loadCurrentLocation);

elements.unitToggle.addEventListener('click', () => {
    useFahrenheit = !useFahrenheit;
    elements.unitToggle.querySelectorAll('.unit-option').forEach(option => {
        option.classList.toggle('is-active', option.dataset.unit === (useFahrenheit ? 'fahrenheit' : 'celsius'));
    });
    if (latestForecast) {
        renderForecast(latestForecast, latestLabel);
        setStatus(`Temperatures shown in °${useFahrenheit ? 'F' : 'C'} · ${latestLabel}`);
    }
});

renderRecentSearches();
loadCity('Lucknow');
