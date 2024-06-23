import { fetchWithJSON, initializeServerSelection, updateServerStatus, getServerEndpoint, isServerUp } from './common.js';

let isStopping = false;
let stopInterval;
let stopStatus = {
    total_time: 0,
    running_jobs: 0,
    waiting_jobs: 0,
    is_stopping: false,
    stopped_jobs: 0,
    total_jobs: 0,
    estimated_time_remaining: "N/A",
};

let jobStopTimes = [];
let totalJobs = 0;
let jobStartTimes = [];

document.addEventListener('DOMContentLoaded', function () {
    console.log('Stop All Jobs page loaded');
    fetch('/config')
        .then(response => response.json())
        .then(config => {
            initializeServerSelection(config);
            setInterval(() => updateServerStatus(config), 30000);
            setTimeout(fetchJobStatus, 500); // Slight delay to ensure ping responses are processed
            setupEventListeners();
        })
        .catch(error => {
            console.error('Error fetching config:', error);
        });
});

function setupEventListeners() {
    document.getElementById('stop-all-jobs-button').addEventListener('click', stopAllJobs);
    document.getElementById('cancel-stop-button').addEventListener('click', cancelStopAllJobs);
}

function stopAllJobs() {
    const serverEndpoint = getServerEndpoint();
    if (!isServerUp()) {
        alert('Selected server is down. Please select a different server.');
        return;
    }

    if (isStopping) {
        alert('Already stopping jobs. Please wait.');
        return;
    }

    isStopping = true;
    stopStatus = {
        total_time: 0,
        running_jobs: 0,
        waiting_jobs: 0,
        is_stopping: true,
        stopped_jobs: 0,
        total_jobs: 0,
        estimated_time_remaining: "N/A",
    };
    jobStopTimes = [];
    jobStartTimes = [];
    totalJobs = 0;

    const stopAllJobsButton = document.getElementById('stop-all-jobs-button');
    const cancelStopButton = document.getElementById('cancel-stop-button');
    stopAllJobsButton.disabled = true;
    stopAllJobsButton.style.opacity = 0.5;
    cancelStopButton.disabled = false;
    cancelStopButton.style.opacity = 1;

    const startTime = Date.now();
    stopInterval = setInterval(() => {
        fetchJobHistoryAndStop(serverEndpoint, startTime);
    }, 5000);
}

function fetchJobStatus() {
    const serverEndpoint = getServerEndpoint();
    if (!isServerUp()) {
        console.error('Selected server is down.');
        document.getElementById('stop-status-text').textContent = 'Selected server is down. Please select a different server.';
        return;
    }

    fetchWithJSON(`${serverEndpoint}/v1/generation/job-history`)
        .then(data => {
            const allJobs = data.queue;
            const jobDetailsPromises = allJobs.map(job => {
                return fetchWithJSON(`${serverEndpoint}/v1/generation/query-job?job_id=${job.job_id}&require_step_preview=false`)
                    .then(details => {
                        job.details = details;
                    })
                    .catch(error => {
                        console.error(`Error fetching job details for ${job.job_id}:`, error);
                    });
            });

            Promise.all(jobDetailsPromises).then(() => {
                stopStatus.total_jobs = allJobs.length;
                stopStatus.running_jobs = allJobs.filter(job => job.details && job.details.job_stage === 'RUNNING').length;
                stopStatus.waiting_jobs = allJobs.filter(job => job.details && job.details.job_stage === 'WAITING').length;

                updateStopStatusUI();
            });
        })
        .catch(error => {
            console.error('Error fetching job history:', error);
        });
}

function fetchJobHistoryAndStop(serverEndpoint, startTime) {
    fetchWithJSON(`${serverEndpoint}/v1/generation/job-history`)
        .then(data => {
            const allJobs = data.queue;
            const runningJobs = [];
            const waitingJobs = [];

            const jobDetailsPromises = allJobs.map(job => {
                return fetchWithJSON(`${serverEndpoint}/v1/generation/query-job?job_id=${job.job_id}&require_step_preview=false`)
                    .then(details => {
                        job.details = details;
                        if (details.job_stage === 'RUNNING' && details.job_status.includes('Step')) {
                            runningJobs.push(job);
                        } else if (details.job_stage === 'WAITING') {
                            waitingJobs.push(job);
                        }
                    })
                    .catch(error => {
                        console.error(`Error fetching job details for ${job.job_id}:`, error);
                    });
            });

            Promise.all(jobDetailsPromises).then(() => {
                stopStatus.running_jobs = runningJobs.length;
                stopStatus.waiting_jobs = waitingJobs.length;
                stopStatus.total_jobs = allJobs.length;

                if (runningJobs.length === 0 && waitingJobs.length === 0) {
                    if (allJobs.length === 0) {
                        stopStatus.is_stopping = false;
                        isStopping = false;
                        clearInterval(stopInterval);
                        alert('Stop process completed.');
                        updateStopStatusUI();
                        return;
                    }
                } else {
                    stopJobs(serverEndpoint, runningJobs, startTime);
                }
            });
        })
        .catch(error => {
            console.error('Error fetching job history:', error);
            stopStatus.is_stopping = false;
            isStopping = false;
            clearInterval(stopInterval);
            alert('Error fetching job history.');
            updateStopStatusUI();
        });
}

function stopJobs(serverEndpoint, runningJobs, startTime) {
    const stopRunningJob = jobId => {
        const jobStartTime = Date.now();
        jobStartTimes.push(jobStartTime);
        return fetchWithJSON(`${serverEndpoint}/v1/generation/stop`, 'POST', { job_id: jobId })
            .then(response => {
                const jobEndTime = Date.now();
                const jobTime = (jobEndTime - jobStartTime) / 1000;
                jobStopTimes.push(jobTime);

                stopStatus.stopped_jobs += 1;
                console.log(`Stopped job ${jobId}`);
                updateStopStatusUI();

                if (jobStopTimes.length > 2) { // Ignore the first stop time
                    const averageStopTime = jobStopTimes.slice(1).reduce((a, b) => a + b, 0) / (jobStopTimes.length - 1);
                    const remainingJobs = stopStatus.running_jobs + stopStatus.waiting_jobs;
                    const estimatedRemainingTime = averageStopTime * remainingJobs;
                    stopStatus.estimated_time_remaining = `${estimatedRemainingTime.toFixed(2)} seconds`;
                } else {
                    stopStatus.estimated_time_remaining = 'N/A';
                }
                updateStopStatusUI();
            })
            .catch(error => {
                console.error(`Error stopping job ${jobId}:`, error);
            });
    };

    const stopPromises = runningJobs.map(job => stopRunningJob(job.job_id));

    Promise.all(stopPromises).then(() => {
        stopStatus.total_time = (Date.now() - startTime) / 1000;
        updateStopStatusUI();
    });
}

function cancelStopAllJobs() {
    if (isStopping) {
        clearInterval(stopInterval);
        isStopping = false;
        stopStatus.is_stopping = false;
        alert('Stopped the stop process.');
        updateStopStatusUI();

        const stopAllJobsButton = document.getElementById('stop-all-jobs-button');
        const cancelStopButton = document.getElementById('cancel-stop-button');
        stopAllJobsButton.disabled = true;
        stopAllJobsButton.style.opacity = 0.5;
        cancelStopButton.disabled = true;
        cancelStopButton.style.opacity = 0.5;
    }
}

function updateStopStatusUI() {
    const stopStatusText = document.getElementById('stop-status-text');
    const stopStatusDetails = document.getElementById('stop-status-details');

    if (stopStatus.is_stopping) {
        stopStatusText.textContent = 'Stopping jobs...';
    } else {
        stopStatusText.textContent = stopStatus.stopped_jobs > 0 ? 'Stop process completed.' : 'No jobs running.';
    }

    stopStatusDetails.innerHTML = `
        Total time: ${stopStatus.total_time.toFixed(2)} seconds<br>
        Running jobs: ${stopStatus.running_jobs}<br>
        Waiting jobs: ${stopStatus.waiting_jobs}<br>
        Stopped jobs: ${stopStatus.stopped_jobs}<br>
        Total jobs: ${totalJobs}<br>
        Estimated time remaining: ${stopStatus.estimated_time_remaining}<br>
    `;

    const stopAllJobsButton = document.getElementById('stop-all-jobs-button');
    const cancelStopButton = document.getElementById('cancel-stop-button');
    if (stopStatus.is_stopping) {
        stopAllJobsButton.disabled = true;
        stopAllJobsButton.style.opacity = 0.5;
        cancelStopButton.disabled = false;
        cancelStopButton.style.opacity = 1;
    } else {
        stopAllJobsButton.disabled = stopStatus.running_jobs + stopStatus.waiting_jobs === 0;
        stopAllJobsButton.style.opacity = stopStatus.running_jobs + stopStatus.waiting_jobs === 0 ? 0.5 : 1;
        cancelStopButton.disabled = true;
        cancelStopButton.style.opacity = 0.5;
    }
}
