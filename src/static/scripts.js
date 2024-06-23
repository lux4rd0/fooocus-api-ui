let selectedFiles = new Set();
let refreshTimeoutStatus;
let refreshTimeoutHistory;
let isFetchingStatus = false;
let isFetchingHistory = false;
let stopAllIntervalId;
let isTerminated = false;
let selectedImage = null;

// Initialize job status refresh intervals
document.addEventListener('DOMContentLoaded', function() {
    console.log('Document loaded');
    const currentPath = window.location.pathname;
    
    if (currentPath.endsWith('/status')) {
        getUpscaleJobStatus();
        setRefreshInterval('status');
        displayTotalJobs();
    } else if (currentPath.endsWith('/history')) {
        getUpscaleJobHistory();
        setRefreshInterval('history');
    } else if (currentPath.endsWith('/add-upscale')) {
        loadFileBrowser();
    } else if (currentPath.endsWith('/clear-cache')) {
        getCacheStats();
    } else if (currentPath.endsWith('/stop-all')) {
        getStopStatus();
        setInterval(getStopStatus, 5000);
    } else if (currentPath.endsWith('/add-faceswap')) {
        loadFaceSwapImages();
        initializeSliders();
        toggleSeedInput(); // Initialize seed input visibility based on checkbox state
    }
});


function getUpscaleJobStatus() {
    if (isFetchingStatus) return;
    isFetchingStatus = true;
    console.log('Fetching job status');
    const jobStatusDiv = document.getElementById('upscale-job-status');
    if (!jobStatusDiv) {
        isFetchingStatus = false;
        return;
    }
    jobStatusDiv.innerHTML = '';
    fetch('/api/upscale/status')
        .then(response => response.json())
        .then(data => {
            console.log('Job status data:', data);
            if (data.length === 0) {
                jobStatusDiv.innerHTML = '<p>No unfinished jobs found.</p>';
                isFetchingStatus = false;
                return;
            }
            const uniqueJobs = getUniqueJobs(data);
            uniqueJobs.forEach(job => {
                const jobItem = document.createElement('div');
                jobItem.className = 'job-item ' + (job.job_stage === 'RUNNING' ? 'stage-running' : 'stage-waiting');
                jobItem.innerHTML = `<strong>Job ID:</strong> ${job.job_id}<br>
                                     <strong>Job Type:</strong> ${job.job_type}<br>
                                     <strong>Stage:</strong> ${job.job_stage}<br>
                                     <strong>Progress:</strong> ${job.job_progress}%<br>
                                     <strong>Status:</strong> ${job.job_status || 'N/A'}<br>`;
                if (job.job_step_preview) {
                    jobItem.innerHTML += `<strong>Preview:</strong><br><img src="data:image/png;base64,${job.job_step_preview}" class="job-preview"><br>`;
                }
                if (job.estimated_time_remaining) {
                    jobItem.innerHTML += `<strong>Time Remaining:</strong> ${job.estimated_time_remaining}<br>`;
                }
                const stopButton = document.createElement('button');
                stopButton.textContent = 'Stop';
                stopButton.onclick = () => stopUpscaleJob(job.job_id);
                jobItem.appendChild(stopButton);
                jobStatusDiv.appendChild(jobItem);
            });
            isFetchingStatus = false;
        })
        .catch(error => {
            console.error('Error fetching job status:', error);
            isFetchingStatus = false;
        });
}


function getUpscaleJobHistory() {
    if (isFetchingHistory) return;
    isFetchingHistory = true;
    console.log('Fetching job history');
    const jobHistoryDiv = document.getElementById('upscale-job-history');
    if (!jobHistoryDiv) {
        isFetchingHistory = false;
        return;
    }
    jobHistoryDiv.innerHTML = '';
    fetch('/api/upscale/history')
        .then(response => response.json())
        .then(data => {
            console.log('Job history data:', data);
            if (!data.history || data.history.length === 0) {
                jobHistoryDiv.innerHTML = '<p>No jobs found.</p>';
                isFetchingHistory = false;
                return;
            }
            data.history.reverse(); // Reverse to show the most recent jobs first
            data.history.forEach(job => {
                const jobItem = document.createElement('div');
                jobItem.className = 'job-item';
                jobItem.innerHTML = `<strong>Job ID:</strong> ${job.job_id}<br>
                                     <strong>Status:</strong> ${job.is_finished ? 'Finished' : 'Running'}<br>`;
                if (job.details && job.details.job_result) {
                    const imagesContainer = document.createElement('div');
                    imagesContainer.className = 'images-container';
                    job.details.job_result.forEach(result => {
                        if (result.thumbnail_url) {
                            const urlParts = result.url.split('/');
                            const fileName = urlParts[urlParts.length - 1];
                            const imgElement = document.createElement('a');
                            imgElement.href = result.url;
                            imgElement.download = fileName;
                            imgElement.innerHTML = `<img src="${result.thumbnail_url}" class="final-image">`;
                            imagesContainer.appendChild(imgElement);
                        }
                    });
                    jobItem.appendChild(imagesContainer);
                }
                jobHistoryDiv.appendChild(jobItem);
            });
            if (data.cache_stats) {
                const cacheStatsDiv = document.getElementById('cache-stats');
                if (cacheStatsDiv) {
                    cacheStatsDiv.innerHTML = `<strong>Cache Stats:</strong><br>
                                               <strong>Total Size:</strong> ${data.cache_stats.total_size}<br>
                                               <strong>Total Files:</strong> ${data.cache_stats.total_files}<br>`;
                }
            }
            isFetchingHistory = false;
        })
        .catch(error => {
            console.error('Error fetching job history:', error);
            isFetchingHistory = false;
        });
}




function getUniqueJobs(jobs) {
    const uniqueJobsMap = new Map();
    jobs.forEach(job => {
        uniqueJobsMap.set(job.job_id, job);
    });
    return Array.from(uniqueJobsMap.values());
}

function getUpscaleJobHistory() {
    if (isFetchingHistory) return;
    isFetchingHistory = true;
    console.log('Fetching job history');
    const jobHistoryDiv = document.getElementById('upscale-job-history');
    if (!jobHistoryDiv) {
        isFetchingHistory = false;
        return;
    }
    jobHistoryDiv.innerHTML = '';
    fetch('/api/upscale/history')
        .then(response => response.json())
        .then(data => {
            console.log('Job history data:', data);
            if (!data.history || data.history.length === 0) {
                jobHistoryDiv.innerHTML = '<p>No jobs found.</p>';
                isFetchingHistory = false;
                return;
            }
            data.history.reverse(); // Reverse to show the most recent jobs first
            data.history.forEach(job => {
                const jobItem = document.createElement('div');
                jobItem.className = 'job-item';
                jobItem.innerHTML = `<strong>Job ID:</strong> ${job.job_id}<br>
                                     <strong>Status:</strong> ${job.is_finished ? 'Finished' : 'Running'}<br>`;
                if (job.details && job.details.job_result) {
                    const imagesContainer = document.createElement('div');
                    imagesContainer.className = 'images-container';
                    job.details.job_result.forEach(result => {
                        if (result.thumbnail_url) {
                            const urlParts = result.url.split('/');
                            const fileName = urlParts[urlParts.length - 1];
                            const imgElement = document.createElement('a');
                            imgElement.href = result.url;
                            imgElement.download = fileName;
                            imgElement.innerHTML = `<img src="${result.thumbnail_url}" class="final-image">`;
                            imagesContainer.appendChild(imgElement);
                        }
                    });
                    jobItem.appendChild(imagesContainer);
                }
                jobHistoryDiv.appendChild(jobItem);
            });
            if (data.cache_stats) {
                const cacheStatsDiv = document.getElementById('cache-stats');
                if (cacheStatsDiv) {
                    cacheStatsDiv.innerHTML = `<strong>Cache Stats:</strong><br>
                                               <strong>Total Size:</strong> ${data.cache_stats.total_size}<br>
                                               <strong>Total Files:</strong> ${data.cache_stats.total_files}<br>`;
                }
            }
            isFetchingHistory = false;
        })
        .catch(error => {
            console.error('Error fetching job history:', error);
            isFetchingHistory = false;
        });
}



function stopUpscaleJob(jobId) {
    console.log(`Stopping job: ${jobId}`);
    fetch(`/api/upscale/stop/${jobId}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            console.log(`Stop job response for ${jobId}:`, data);
            if (data.error) {
                console.error(`Error stopping job ${jobId}: ${data.message}`);
                alert(`Error stopping job ${jobId}: ${data.message}`);
            } else {
                alert(`Job ${jobId} stopped successfully.`);
            }
            getUpscaleJobStatus();
            getUpscaleJobHistory();
        })
        .catch(error => {
            console.error(`Error stopping job ${jobId}:`, error);
            alert(`Error stopping job ${jobId}: ${error.message}`);
        });
}

function stopAllUpscaleJobs() {
    console.log('Stopping all jobs');
    const stopAllJobsStatusDiv = document.getElementById('stop-all-jobs-status');
    if (!stopAllJobsStatusDiv) return;
    stopAllJobsStatusDiv.innerHTML = '<p>Stopping jobs...</p>';

    fetch('/api/upscale/stop/all', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            console.log('Stop all jobs initiated:', data);
            let initialTotalJobs = data.total_jobs;
            let intervalId = setInterval(() => {
                fetch('/api/upscale/stop-status')
                    .then(response => response.json())
                    .then(data => {
                        if (!data.is_stopping) {
                            clearInterval(intervalId);
                            stopAllJobsStatusDiv.innerHTML = `<p>All jobs stopped in ${data.total_time}. Total stopped jobs: ${data.stopped_jobs}.</p>`;
                            getUpscaleJobStatus();
                            getUpscaleJobHistory();
                        } else {
                            stopAllJobsStatusDiv.innerHTML = `<p>Stopping jobs... ${data.running_jobs} jobs remaining out of ${initialTotalJobs}. Stopped jobs: ${data.stopped_jobs}. Estimated time remaining: ${data.estimated_time_remaining}.</p>`;
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching stop status:', error);
                    });
            }, 5000);
        })
        .catch(error => {
            console.error('Error stopping all jobs:', error);
        });
}




function displayTotalJobs() {
    fetch('/api/upscale/status')
        .then(response => response.json())
        .then(data => {
            const totalJobsDiv = document.getElementById('total-jobs');
            if (totalJobsDiv) {
                totalJobsDiv.innerHTML = `Total jobs in the queue: ${data.length}`;
            }
        })
        .catch(error => {
            console.error('Error fetching total jobs:', error);
        });
}



// Terminate Stop All Jobs
function terminateStopAllJobs() {
    console.log('Terminating stop all jobs process');
    fetch('/api/upscale/stop-all/terminate', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            console.log('Terminate stop all jobs response:', data);
            alert('Stop all jobs process terminated.');
            clearInterval(stopAllIntervalId);
            document.querySelector('.button-stop-all').disabled = false;
            document.querySelector('.button-terminate-stop-all').disabled = true;
            fetch('/api/upscale/stop-status')
                .then(response => response.json())
                .then(data => {
                    const stopAllJobsStatusDiv = document.getElementById('stop-all-jobs-status');
                    if (stopAllJobsStatusDiv) {
                        if (!data.is_stopping) {
                            stopAllJobsStatusDiv.innerHTML = `<p>All jobs stopped in ${data.total_time}. Total stopped jobs: ${data.stopped_jobs}.</p>`;
                        } else {
                            stopAllJobsStatusDiv.innerHTML = `<p>Stopping jobs... ${data.running_jobs} jobs remaining out of ${data.total_jobs}. Stopped jobs: ${data.stopped_jobs}.</p>`;
                        }
                    }
                })
                .catch(error => {
                    console.error('Error fetching stop status:', error);
                });
            getStopStatus();
        })
        .catch(error => {
            console.error('Error terminating stop all jobs process:', error);
            alert('Error terminating stop all jobs process.');
        });
}

// Terminate Stop All Jobs
function terminateStopAllJobs() {
    console.log('Terminating stop all jobs process');
    fetch('/api/upscale/stop-all/terminate', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            console.log('Terminate stop all jobs response:', data);
            alert('Stop all jobs process terminated.');
            clearInterval(stopAllIntervalId);
            isTerminated = true;
            getStopStatus();
        })
        .catch(error => {
            console.error('Error terminating stop all jobs process:', error);
            alert('Error terminating stop all jobs process.');
        });
}

// Fetch Stop Status
function getStopStatus() {
    fetch('/api/upscale/stop-status')
        .then(response => response.json())
        .then(data => {
            const stopAllJobsStatusDiv = document.getElementById('stop-all-jobs-status');
            if (stopAllJobsStatusDiv) {
                if (!data.is_stopping || isTerminated) {
                    stopAllJobsStatusDiv.innerHTML = `<p>All jobs stopped in ${data.total_time}. Total stopped jobs: ${data.stopped_jobs}.</p>`;
                    clearInterval(stopAllIntervalId);
                    document.querySelector('.button-stop-all').disabled = false;
                    document.querySelector('.button-terminate-stop-all').disabled = true;
                    getUpscaleJobStatus();
                    getUpscaleJobHistory();
                } else {
                    stopAllJobsStatusDiv.innerHTML = `<p>Stopping jobs... ${data.running_jobs} jobs remaining out of ${data.total_jobs}. Stopped jobs: ${data.stopped_jobs}.</p>`;
                    document.querySelector('.button-stop-all').disabled = true;
                    document.querySelector('.button-terminate-stop-all').disabled = false;
                }
            }
        })
        .catch(error => {
            console.error('Error fetching stop status:', error);
        });
}

// Stop All Upscale Jobs
function stopAllUpscaleJobs() {
    console.log('Stopping all jobs');
    const stopAllJobsStatusDiv = document.getElementById('stop-all-jobs-status');
    if (!stopAllJobsStatusDiv) return;
    stopAllJobsStatusDiv.innerHTML = '<p>Stopping jobs...</p>';
    document.querySelector('.button-stop-all').disabled = true;
    document.querySelector('.button-terminate-stop-all').disabled = false;
    isTerminated = false;

    fetch('/api/upscale/stop/all', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            console.log('Stop all jobs initiated:', data);
            stopAllIntervalId = setInterval(() => {
                getStopStatus();
            }, 5000);
        })
        .catch(error => {
            console.error('Error stopping all jobs:', error);
            document.querySelector('.button-stop-all').disabled = false;
            document.querySelector('.button-terminate-stop-all').disabled = true;
        });
}





function clearCache() {
    console.log('Clearing cache');
    fetch('/api/upscale/cache/clear', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            console.log('Clear cache response:', data);
            alert(`Clear Cache Response: ${JSON.stringify(data)}`);
            getUpscaleJobHistory();
        })
        .catch(error => {
            console.error('Error clearing cache:', error);
        });
}

function handleFiles(files) {
    console.log('Handling files:', files);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('file', files[i]);
    }
    fetch('/upload', {
        method: 'POST',
        body: formData
    }).then(response => {
        if (response.ok) {
            console.log('Files uploaded successfully');
            alert('Files uploaded successfully.');
            document.getElementById('add-job-status').innerHTML = '<p>Files uploaded successfully.</p>';
        } else {
            console.error('Failed to upload files');
            alert('Failed to upload files.');
            document.getElementById('add-job-status').innerHTML = '<p>Failed to upload files.</p>';
        }
    })
    .catch(error => {
        console.error('Error uploading files:', error);
    });
}

function allowDrop(event) {
    event.preventDefault();
}

function handleDrop(event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    handleFiles(files);
}

function loadFileBrowser(dir = '') {
    console.log(`Loading file browser for directory: ${dir}`);
    fetch(`/browse?dir=${encodeURIComponent(dir)}`)
        .then(response => response.json())
        .then(data => {
            console.log('File browser data:', data);
            if (data.error) {
                document.getElementById('file-browser').innerHTML = `<p>${data.error}</p>`;
                return;
            }
            const files = data.files.map(f => ({ name: f, date: new Date(f) }));
            const sortedFiles = sortFiles(files, document.getElementById('sort-files').value);

            let html = '<ul>';
            if (dir) {
                html += `<li><a href="#" onclick="loadFileBrowser('${dir.split('/').slice(0, -1).join('/')}')">..</a></li>`;
            }
            data.dirs.forEach(d => {
                html += `<li><a href="#" onclick="loadFileBrowser('${dir ? dir + '/' : ''}${d}')">${d}/</a></li>`;
            });
            sortedFiles.forEach(f => {
                const filePath = `${dir ? dir + '/' : ''}${f.name}`;
                const isSelected = selectedFiles.has(filePath);
                html += `<li class="file-browser-item ${isSelected ? 'selected' : ''}" onclick="toggleFileSelection('${filePath}')">
                            <img src="/api/thumbnail/${filePath}" class="file-thumbnail">
                            <span class="file-label">${f.name}</span>
                         </li>`;
            });
            html += '</ul>';
            document.getElementById('file-browser').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading file browser:', error);
        });
}

function toggleFileSelection(filePath) {
    const item = document.querySelector(`.file-browser-item[onclick="toggleFileSelection('${filePath}')"]`);
    if (selectedFiles.has(filePath)) {
        selectedFiles.delete(filePath);
        item.classList.remove('selected');
    } else {
        selectedFiles.add(filePath);
        item.classList.add('selected');
    }
}

function selectAllFiles() {
    console.log('Selecting all files');
    document.querySelectorAll('.file-browser-item').forEach(item => {
        const filePath = item.querySelector('.file-thumbnail').getAttribute('src').replace('/api/thumbnail/', '');
        selectedFiles.add(filePath);
        item.classList.add('selected');
    });
}

function unselectAllFiles() {
    console.log('Unselecting all files');
    document.querySelectorAll('.file-browser-item').forEach(item => {
        const filePath = item.querySelector('.file-thumbnail').getAttribute('src').replace('/api/thumbnail/', '');
        selectedFiles.delete(filePath);
        item.classList.remove('selected');
    });
}

function submitWildcardPattern() {
    const filePatternInput = document.getElementById('file-pattern').value;
    if (filePatternInput) {
        console.log(`Submitting wildcard pattern: ${filePatternInput}`);
        fetch('/upload-server', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ file_pattern: filePatternInput }),
        }).then(response => response.json())
        .then(data => {
            if (data.msg) {
                alert(data.msg);
            } else if (data.error) {
                alert(data.error);
            }
        })
        .catch(error => {
            console.error('Error submitting wildcard pattern:', error);
        });
    }
}

function submitSelectedFiles() {
    console.log('Submitting selected files');
    if (selectedFiles.size > 0) {
        if (confirm('Are you sure you want to submit the selected files?')) {
            const filePaths = Array.from(selectedFiles);
            fetch('/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ file_paths: filePaths }),
            }).then(response => response.json())
            .then(data => {
                if (data.msg) {
                    alert(data.msg);
                    document.getElementById('add-job-status').innerHTML = '<p>Files submitted successfully.</p>';
                } else if (data.error) {
                    alert(data.error);
                    document.getElementById('add-job-status').innerHTML = '<p>Failed to submit files.</p>';
                }
            })
            .catch(error => {
                console.error('Error submitting selected files:', error);
            });
        }
    } else {
        alert('No files selected.');
    }
}

function sortFiles(files, sortOption) {
    switch (sortOption) {
        case 'name-asc':
            return files.sort((a, b) => a.name.localeCompare(b.name));
        case 'name-desc':
            return files.sort((a, b) => b.name.localeCompare(a.name));
        case 'date-asc':
            return files.sort((a, b) => a.date - b.date);
        case 'date-desc':
            return files.sort((a, b) => b.date - a.date);
        default:
            return files;
    }
}

function getCacheStats() {
    console.log('Fetching cache stats');
    fetch('/api/upscale/history')
        .then(response => response.json())
        .then(data => {
            console.log('Cache stats data:', data);
            const cacheStatsDiv = document.getElementById('cache-stats');
            if (cacheStatsDiv) {
                cacheStatsDiv.innerHTML = `<strong>Cache Stats:</strong><br>
                                           <strong>Total Size:</strong> ${data.cache_stats.total_size}<br>
                                           <strong>Total Files:</strong> ${data.cache_stats.total_files}<br>`;
            }
        })
        .catch(error => {
            console.error('Error fetching cache stats:', error);
        });
}

function setRefreshInterval(page) {
    console.log(`Setting refresh interval for ${page}`);
    const intervalElement = document.getElementById(`refresh-interval${page === 'history' ? '-history' : ''}`);
    if (!intervalElement) return;
    const value = intervalElement.value;
    if (page === 'status') {
        clearTimeout(refreshTimeoutStatus);
        if (value !== 'never') {
            refreshTimeoutStatus = setInterval(getUpscaleJobStatus, parseInt(value) * 1000);
        }
    } else if (page === 'history') {
        clearTimeout(refreshTimeoutHistory);
        if (value !== 'never') {
            refreshTimeoutHistory = setInterval(getUpscaleJobHistory, parseInt(value) * 1000);
        }
    }
}

function loadFaceSwapImages() {
    fetch('/api/faceswap/images')
        .then(response => response.json())
        .then(data => {
            const imageSelectionDiv = document.getElementById('image-selection');
            if (!imageSelectionDiv) return;

            imageSelectionDiv.innerHTML = '';
            data.images.forEach(image => {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'img-container';

                const imgElement = document.createElement('img');
                imgElement.src = `data:image/png;base64,${image.thumbnail}`;
                imgElement.alt = image.filename;
                imgElement.className = 'thumbnail';
                imgElement.onclick = () => selectImage(image.filename);

                imgContainer.appendChild(imgElement);
                imageSelectionDiv.appendChild(imgContainer);
            });
        })
        .catch(error => {
            console.error('Error loading face swap images:', error);
        });
}

function selectImage(imageName) {
    const selectedImageDiv = document.getElementById('selected-image');
    if (!selectedImageDiv) return;

    selectedImageDiv.innerHTML = `<p>Selected Image: ${imageName}</p>`;
    selectedImageDiv.dataset.selectedImage = imageName;

    document.querySelectorAll('.img-container').forEach(container => {
        container.classList.remove('selected');
    });
    event.currentTarget.parentNode.classList.add('selected');
}

function addFaceSwapJob() {
    const prompt = document.getElementById('text-prompt').value;
    const fileName = document.getElementById('file-name').value;
    const aspectRatio = document.getElementById('aspect-ratios').value;
    const outputFormat = document.getElementById('output-format').value;
    const saveMetaValue = document.getElementById('save-meta').value;
    const saveMeta = saveMetaValue !== 'no';
    const metaScheme = saveMetaValue !== 'no' ? saveMetaValue.split(' ')[0].toLowerCase() : '';
    const randomSeed = document.getElementById('random-seed').checked;
    const seed = randomSeed ? null : parseInt(document.getElementById('seed').value, 10);
    const stopAt = parseFloat(document.getElementById('stop-at').value);
    const weight = parseFloat(document.getElementById('weight').value);
    const imageNumber = parseInt(document.getElementById('image-number').value, 10);
    const quality = document.getElementById('quality').value;
    const selectedImage = document.getElementById('selected-image').dataset.selectedImage;

    if (!selectedImage) {
        alert('Please select an image.');
        return;
    }

    const faceSwapData = {
        prompt,
        save_extension: outputFormat,
        save_name: fileName,
        aspect_ratios_selection: aspectRatio,  // Use the corrected aspect ratio
        save_meta: saveMeta,
        meta_scheme: metaScheme,
        seed: seed,
        image_selection: selectedImage,  // Ensure this is included
        image_prompts: [
            {
                cn_img: selectedImage,
                cn_stop: stopAt,
                cn_weight: weight,
                cn_type: "FaceSwap"
            }
        ],
        image_number: imageNumber,
        async_process: true,
        performance_selection: quality
    };

    // Remove null values
    Object.keys(faceSwapData).forEach(key => {
        if (faceSwapData[key] === null) {
            delete faceSwapData[key];
        }
    });

    // Log the data being sent to Fooocus API, truncate the cn_img to 12 characters
    const truncatedData = JSON.parse(JSON.stringify(faceSwapData));
    truncatedData.image_prompts[0].cn_img = truncatedData.image_prompts[0].cn_img.slice(0, 12) + '...';

    console.log('Face Swap data:', truncatedData);

    fetch('/api/faceswap', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(faceSwapData)
    })
        .then(response => response.json())
        .then(data => {
            console.log('Face Swap response:', data);
            alert('Face Swap job added successfully.');
        })
        .catch(error => {
            console.error('Error adding Face Swap job:', error);
            alert('Error adding Face Swap job.');
        });
}



function toggleSeedInput() {
    const seedContainer = document.getElementById('seed-container');
    const randomSeed = document.getElementById('random-seed').checked;
    if (randomSeed) {
        seedContainer.style.display = 'none';
    } else {
        seedContainer.style.display = 'block';
    }
}

function initializeSliders() {
    document.getElementById('stop-at').addEventListener('input', updateStopAtValue);
    document.getElementById('stop-at-value').addEventListener('input', updateStopAtRange);
    document.getElementById('weight').addEventListener('input', updateWeightValue);
    document.getElementById('weight-value').addEventListener('input', updateWeightRange);
    document.getElementById('image-number').addEventListener('input', updateImageNumberValue);
}

function updateStopAtValue() {
    const stopAt = document.getElementById('stop-at').value;
    document.getElementById('stop-at-value').value = stopAt;
}

function updateStopAtRange() {
    const stopAtValue = document.getElementById('stop-at-value').value;
    document.getElementById('stop-at').value = stopAtValue;
}

function updateWeightValue() {
    const weight = document.getElementById('weight').value;
    document.getElementById('weight-value').value = weight;
}

function updateWeightRange() {
    const weightValue = document.getElementById('weight-value').value;
    document.getElementById('weight').value = weightValue;
}

function updateImageNumberValue() {
    const imageNumber = document.getElementById('image-number').value;
    document.getElementById('image-number-value').textContent = imageNumber;
}
