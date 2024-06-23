import { fetchWithJSON, setRefreshInterval, initializeServerSelection, updateServerStatus, getServerEndpoint, isServerUp } from './common.js';

let isFetchingStatus = false;
let refreshTimeoutStatus;

document.addEventListener('DOMContentLoaded', function() {
    console.log('Job Status page loaded');
    fetch('/config')
        .then(response => response.json())
        .then(config => {
            initializeServerSelection(config);
            setupRefreshInterval();
            setupControls();
            setInterval(() => updateServerStatus(config), 30000);
        })
        .then(() => setTimeout(getJobStatus, 100)) // Add a short delay before calling getJobStatus
        .catch(error => {
            console.error('Error fetching config:', error);
        });
});

function setupControls() {
    const intervalElement = document.getElementById('refresh-interval');
    if (intervalElement) {
        intervalElement.addEventListener('change', function() {
            setupRefreshInterval();
        });
    }
}

function setupRefreshInterval() {
    console.log('Setting refresh interval for job status');
    const intervalElement = document.getElementById('refresh-interval');
    if (!intervalElement) return;
    const value = intervalElement.value;
    clearTimeout(refreshTimeoutStatus);
    if (value !== 'never') {
        refreshTimeoutStatus = setInterval(getJobStatus, parseInt(value) * 1000);
    }
}

function updateLastRefreshed() {
    const lastRefreshedElement = document.getElementById('last-refreshed');
    if (lastRefreshedElement) {
        lastRefreshedElement.innerText = `Last Refreshed: ${new Date().toLocaleTimeString()}`;
    }
}

function getJobStatus() {
    if (isFetchingStatus) return;
    isFetchingStatus = true;
    console.log('Fetching job status');
    const jobStatusDiv = document.getElementById('job-status');
    if (!jobStatusDiv) {
        isFetchingStatus = false;
        return;
    }
    jobStatusDiv.innerHTML = '';

    const serverEndpoint = getServerEndpoint();
    if (!isServerUp()) {
        console.error('Selected server is down.');
        jobStatusDiv.innerHTML = '<p>Selected server is down. Please select a different server.</p>';
        isFetchingStatus = false;
        updateLastRefreshed();
        return;
    }

    fetchWithJSON(`${serverEndpoint}/v1/generation/job-history`)
        .then(data => {
            console.log('Job status data:', data);
            const activeJobs = data.queue.filter(job => !job.is_finished);
            if (activeJobs.length === 0) {
                jobStatusDiv.innerHTML = '<p>No active or pending jobs found.</p>';
                isFetchingStatus = false;
                updateLastRefreshed();
                return;
            }
            const promises = activeJobs.map(job => {
                return fetchWithJSON(`${serverEndpoint}/v1/generation/query-job?job_id=${job.job_id}&require_step_preview=true`)
                    .then(details => {
                        job.details = details;
                        return job;
                    });
            });

            Promise.all(promises).then(jobsWithDetails => {
                jobsWithDetails.forEach(job => {
                    console.log('Job details:', job.details);
                    const jobItem = document.createElement('div');
                    jobItem.className = 'job-item ' + (job.details.job_stage === 'RUNNING' ? 'stage-running' : 'stage-waiting');
                    jobItem.innerHTML = `
                        <strong>Job ID:</strong> ${job.job_id}<br>
                        <strong>Job Type:</strong> ${job.details.job_type}<br>
                        <strong>Stage:</strong> ${job.details.job_stage}<br>
                        ${job.details.job_stage !== 'WAITING' ? `<strong>Progress:</strong> ${job.details.job_progress}%<br>` : ''}
                        ${job.details.job_stage !== 'WAITING' ? `<strong>Status:</strong> ${job.details.job_status || 'N/A'}<br>` : ''}
                        ${job.details.job_step_preview ? `<strong>Preview:</strong><br><img src="data:image/png;base64,${job.details.job_step_preview}" class="job-preview"><br>` : ''}
                        ${job.details.estimated_time_remaining ? `<strong>Time Remaining:</strong> ${job.details.estimated_time_remaining}<br>` : ''}
                    `;
                    if (job.details.job_stage === 'RUNNING') {
                        const stopButton = document.createElement('button');
                        stopButton.className = 'button';
                        stopButton.textContent = 'Stop';
                        stopButton.onclick = () => stopJob(job.job_id);
                        jobItem.appendChild(stopButton);
                    }
                    jobStatusDiv.appendChild(jobItem);
                });
                isFetchingStatus = false;
                updateLastRefreshed();
            });
        })
        .catch(error => {
            console.error('Error fetching job status:', error);
            isFetchingStatus = false;
            updateLastRefreshed();
        });
}

function stopJob(jobId) {
    console.log('Stopping job', jobId);
    const serverEndpoint = getServerEndpoint();
    fetchWithJSON(`${serverEndpoint}/v1/generation/stop`, 'POST', { job_id: jobId })
        .then(data => {
            console.log('Stop job response:', data);
            if (data.error) {
                console.error('Error stopping job:', data.message);
                alert('Error stopping job: ' + data.message);
            } else {
                alert('Job stopped successfully.');
                getJobStatus();
            }
        })
        .catch(error => {
            console.error('Error stopping job:', error);
            alert('Error stopping job: ' + error.message);
        });
}
