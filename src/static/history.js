import { fetchWithJSON, setRefreshInterval, initializeServerSelection, updateServerStatus, getServerEndpoint, isServerUp } from './common.js';

let isFetchingHistory = false;
let refreshTimeoutHistory;
let currentPage = 1;
let jobsPerPage = 5;
let sortOrder = 'newest';
let fullHistory = [];

document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    fetch('/config')
        .then(response => response.json())
        .then(config => {
            initializeServerSelection(config);
            setupRefreshInterval();
            setupControls();
            setInterval(() => updateServerStatus(config), 30000);
        })
        .then(() => setTimeout(fetchJobHistory, 100)) // Add a short delay before calling fetchJobHistory
        .catch(error => {
            console.error('Error fetching config:', error);
        });
});

function loadSettings() {
    jobsPerPage = parseInt(localStorage.getItem('jobsPerPage') || 5, 10);
    sortOrder = localStorage.getItem('sortOrder') || 'newest';
    currentPage = parseInt(localStorage.getItem('currentPage') || 1, 10);
    const refreshInterval = localStorage.getItem('refreshInterval') || 'never';

    document.getElementById('job-count').value = jobsPerPage;
    document.getElementById('sort-order').value = sortOrder;
    document.getElementById('refresh-interval').value = refreshInterval;

    setRefreshInterval(fetchJobHistory, refreshInterval);

    const lastRefreshedElement = document.getElementById('last-refreshed');
    lastRefreshedElement.innerText = `Last Refreshed: ${new Date().toLocaleTimeString()}`;
}

function setupControls() {
    const jobsPerPageSelect = document.getElementById('job-count');
    const sortOrderSelect = document.getElementById('sort-order');
    const refreshIntervalSelect = document.getElementById('refresh-interval');

    jobsPerPageSelect.addEventListener('change', function() {
        jobsPerPage = parseInt(this.value, 10);
        localStorage.setItem('jobsPerPage', jobsPerPage);
        currentPage = 1;
        localStorage.setItem('currentPage', currentPage);
        fetchJobHistory();
    });

    sortOrderSelect.addEventListener('change', function() {
        sortOrder = this.value;
        localStorage.setItem('sortOrder', sortOrder);
        fetchJobHistory();
    });

    refreshIntervalSelect.addEventListener('change', function() {
        const interval = this.value;
        localStorage.setItem('refreshInterval', interval);
        setRefreshInterval(fetchJobHistory, interval);
    });
}

function setupRefreshInterval() {
    console.log('Setting refresh interval for job history');
    const intervalElement = document.getElementById('refresh-interval');
    if (!intervalElement) return;
    const value = intervalElement.value;
    clearTimeout(refreshTimeoutHistory);
    if (value !== 'never') {
        refreshTimeoutHistory = setInterval(fetchJobHistory, parseInt(value) * 1000);
    }
}

function updateLastRefreshed() {
    const lastRefreshedElement = document.getElementById('last-refreshed');
    if (lastRefreshedElement) {
        lastRefreshedElement.innerText = `Last Refreshed: ${new Date().toLocaleTimeString()}`;
    }
}

function fetchJobHistory() {
    if (isFetchingHistory) return;
    isFetchingHistory = true;

    const serverEndpoint = getServerEndpoint();
    if (!isServerUp()) {
        console.error('Selected server is down.');
        document.getElementById('upscale-job-history').innerHTML = '<p>Selected server is down. Please select a different server.</p>';
        isFetchingHistory = false;
        updateLastRefreshed();
        return;
    }

    fetchWithJSON(`${serverEndpoint}/v1/generation/job-history`)
        .then(data => {
            fullHistory = data.history;
            if (sortOrder === 'newest') {
                fullHistory.reverse();
            }
            fetchJobDetails();
        })
        .catch(error => {
            console.error('Error fetching job history:', error);
            isFetchingHistory = false;
            updateLastRefreshed();
        });
}

function fetchJobDetails() {
    const promises = fullHistory.map(job => {
        return fetchWithJSON(`${getServerEndpoint()}/v1/generation/query-job?job_id=${job.job_id}&require_step_preview=false`)
            .then(details => {
                job.details = details;
            })
            .catch(error => {
                console.error(`Error fetching job details for ${job.job_id}:`, error);
            });
    });

    Promise.all(promises).then(() => {
        updateJobHistoryDisplay();
        isFetchingHistory = false;
        updateLastRefreshed();
    });
}

function updateJobHistoryDisplay() {
    const start = (currentPage - 1) * jobsPerPage;
    const end = start + jobsPerPage;
    const paginatedJobs = fullHistory.slice(start, end);

    const jobHistoryDiv = document.getElementById('upscale-job-history');
    jobHistoryDiv.innerHTML = '';

    paginatedJobs.forEach(job => {
        const jobItem = document.createElement('div');
        jobItem.className = 'job-item';
        jobItem.innerHTML = `<strong>Job ID:</strong> ${job.job_id}<br>
                             <strong>Status:</strong> ${job.is_finished ? 'Finished' : 'Running'}<br>`;
        if (job.details && job.details.job_result) {
            const imagesContainer = document.createElement('div');
            imagesContainer.className = 'images-container';
            job.details.job_result.forEach(result => {
                if (result.url) {
                    const imgElement = document.createElement('a');
                    imgElement.href = result.url;
                    imgElement.download = result.url.split('/').pop();
                    imgElement.innerHTML = `<img src="${result.url}" class="final-image">`;
                    imagesContainer.appendChild(imgElement);
                }
            });
            jobItem.appendChild(imagesContainer);
        }
        jobHistoryDiv.appendChild(jobItem);
    });

    updatePaginationControls();
}

function updatePaginationControls() {
    const totalPages = Math.ceil(fullHistory.length / jobsPerPage);
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages || totalPages === 1;
    document.getElementById('currentPage').innerText = `Page ${currentPage} of ${totalPages}`;
}

document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
document.getElementById('next-page').addEventListener('click', () => changePage(1));

function changePage(delta) {
    currentPage = Math.max(1, currentPage + delta);
    localStorage.setItem('currentPage', currentPage);
    updateJobHistoryDisplay();
}
