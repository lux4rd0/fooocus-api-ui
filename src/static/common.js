export let refreshTimeout;
let serverStatusMap = {};

export function fetchWithJSON(url, method = 'GET', body = null) {
    const options = { method, headers: {} };
    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    return fetch(url, options).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    });
}

export function setRefreshInterval(callback, interval) {
    clearInterval(refreshTimeout);
    if (interval !== 'never') {
        refreshTimeout = setInterval(callback, parseInt(interval) * 1000);
    }
}

export function pingServer(url) {
    return fetch(`${url}/ping`, { mode: 'cors' })
        .then(response => {
            if (response.ok) {
                return response.json().then(data => data.trim() === 'pong');
            } else {
                console.warn(`Ping failed for ${url}: ${response.status}`);
                return false;
            }
        })
        .catch(error => {
            console.warn(`Ping failed for ${url}: ${error.message}`);
            return false;
        });
}

export function initializeServerSelection(config) {
    const dropdownButton = document.getElementById('dropdown-button');
    const dropdownContent = document.getElementById('dropdown-content');
    const selectedServerName = document.getElementById('selected-server-name');
    const selectedServerStatus = document.getElementById('selected-server-status');

    if (!dropdownButton || !dropdownContent || !selectedServerName || !selectedServerStatus) {
        console.error('One or more required elements are not found.');
        return;
    }

    // Set the first server as the selected server by default
    if (config.length > 0) {
        const firstServer = config[0];
        selectedServerName.textContent = firstServer.name;
        selectedServerName.dataset.url = firstServer.url;
        pingServer(firstServer.url).then(isUp => {
            selectedServerStatus.classList.add(isUp ? 'up' : 'down');
            serverStatusMap[firstServer.url] = isUp;
        });
    }

    config.forEach(server => {
        const option = document.createElement('div');
        option.className = 'server-option';
        option.dataset.url = server.url;
        option.innerHTML = `
            <span>${server.name}</span>
            <span class="server-status"></span>
        `;
        dropdownContent.appendChild(option);

        // Initial ping to set the status
        pingServer(server.url).then(isUp => {
            const statusDot = option.querySelector('.server-status');
            console.log(`Initial status for ${server.url}:`, isUp);
            if (!statusDot) {
                console.error(`No status dot found for server URL: ${server.url}`);
                return;
            }
            if (isUp) {
                statusDot.classList.add('up');
                statusDot.classList.remove('down');
            } else {
                statusDot.classList.add('down');
                statusDot.classList.remove('up');
            }
            serverStatusMap[server.url] = isUp;
        });

        option.addEventListener('click', () => {
            selectedServerName.textContent = server.name;
            selectedServerName.dataset.url = server.url;
            const isUp = serverStatusMap[server.url];
            selectedServerStatus.classList.remove('up', 'down');
            selectedServerStatus.classList.add(isUp ? 'up' : 'down');
            dropdownContent.style.display = 'none';

            // Reload job history if the job history source is selected
            const sourceSelect = document.getElementById('image-source');
            if (sourceSelect && sourceSelect.value === 'history') {
                loadJobHistory();
            }
        });
    });

    dropdownButton.addEventListener('click', () => {
        dropdownContent.style.display = dropdownContent.style.display === 'block' ? 'none' : 'block';
    });

    window.addEventListener('click', (event) => {
        if (!dropdownButton.contains(event.target)) {
            dropdownContent.style.display = 'none';
        }
    });
}

export function updateServerStatus(config) {
    config.forEach(server => {
        pingServer(server.url).then(isUp => {
            const option = document.querySelector(`.server-option[data-url="${server.url}"] .server-status`);
            console.log(`Updating status for ${server.url}:`, isUp);
            if (!option) {
                console.error(`No status dot found for server URL: ${server.url}`);
                return;
            }
            if (isUp) {
                option.classList.add('up');
                option.classList.remove('down');
            } else {
                option.classList.add('down');
                option.classList.remove('up');
            }
            serverStatusMap[server.url] = isUp;
        });
    });
}

export function getServerEndpoint() {
    const selectedServerName = document.getElementById('selected-server-name');
    return selectedServerName ? selectedServerName.dataset.url : null;
}

export function isServerUp() {
    const endpoint = getServerEndpoint();
    return serverStatusMap[endpoint];
}
