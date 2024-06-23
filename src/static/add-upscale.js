import { fetchWithJSON, initializeServerSelection, updateServerStatus, getServerEndpoint, isServerUp } from './common.js';

let selectedFiles = new Set();
let isFetchingJobHistory = false;
let currentPage = 1;
let itemsPerPage = 10; // Default items per page
let totalPages = 1; // Default total pages
let allFiles = [];

document.addEventListener('DOMContentLoaded', function() {
    fetchWithJSON('/config')
        .then(config => {
            console.log('Server config:', config);
            initializeServerSelection(config);
            updateServerStatus(config);
        })
        .catch(error => {
            console.error('Error fetching config:', error);
        });

    console.log('Add Upscale Job page loaded');
    setupDefaults();
    loadFileBrowser();
    setupControls();
    document.getElementById('image-source').addEventListener('change', changeImageSource);
    document.getElementById('sort-files').addEventListener('change', handleSortFilesChange);
    const uploadArea = document.getElementById('upload-area');
    if (uploadArea) {
        uploadArea.addEventListener('dragover', allowDrop);
        uploadArea.addEventListener('drop', handleDrop);
        uploadArea.addEventListener('dragenter', handleDragEnter);
        uploadArea.addEventListener('dragleave', handleDragLeave);
    }
});

function setupDefaults() {
    const sortFilesSelect = document.getElementById('sort-files');
    const itemsPerPageSelect = document.getElementById('items-per-page');
    
    sortFilesSelect.value = localStorage.getItem('sortFiles') || 'date-desc';
    itemsPerPageSelect.value = localStorage.getItem('itemsPerPage') || '10';

    sortFilesSelect.addEventListener('change', function() {
        localStorage.setItem('sortFiles', this.value);
        handleSortFilesChange();
    });

    itemsPerPageSelect.addEventListener('change', function() {
        localStorage.setItem('itemsPerPage', this.value);
        changeItemsPerPage();
    });
}

function handleFiles(files) {
    console.log('Handling files:', files);
    const uploadArea = document.getElementById('upload-area');
    uploadArea.classList.remove('dimmed');
    for (let i = 0; i < files.length; i++) {
        uploadFile(files[i]);
    }
}

function uploadFile(file) {
    const reader = new FileReader();
    reader.onloadend = function() {
        const imageData = reader.result.split(',')[1];
        submitUpscaleJob(imageData, file.name);
    };
    reader.readAsDataURL(file);
}

function allowDrop(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const uploadArea = document.getElementById('upload-area');
    uploadArea.classList.add('dimmed');
}

function handleDrop(event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    handleFiles(files);
    const uploadArea = document.getElementById('upload-area');
    uploadArea.classList.remove('dimmed');
}

function handleDragEnter(event) {
    const uploadArea = document.getElementById('upload-area');
    uploadArea.classList.add('dimmed');
}

function handleDragLeave(event) {
    const uploadArea = document.getElementById('upload-area');
    uploadArea.classList.remove('dimmed');
}

function setupControls() {
    const wildcardForm = document.getElementById('wildcard-form');
    if (wildcardForm) {
        wildcardForm.addEventListener('submit', function(event) {
            event.preventDefault();
            loadFileBrowser();
        });
    }
    updateSubmitButton();
}

function loadFileBrowser(dir = '') {
    const sourceSelect = document.getElementById('image-source');
    const source = sourceSelect.value;

    if (source === 'local') {
        console.log(`Loading file browser for directory: ${dir}`);
        const filePattern = document.getElementById('file-pattern').value || '*';
        const regex = new RegExp(filePattern.replace('*', '.*').replace('?', '.'), 'i');

        fetch(`/browse?dir=${encodeURIComponent(dir)}`)
            .then(response => response.json())
            .then(data => {
                console.log('File browser data:', data);
                if (data.error) {
                    document.getElementById('file-browser').innerHTML = `<p>${data.error}</p>`;
                    return;
                }
                const files = data.files.filter(f => regex.test(f.name)).map(f => ({ name: f.name, date: new Date(f.mtime * 1000) }));
                const sortedFiles = sortFiles(files, document.getElementById('sort-files').value);
                allFiles = [...new Set(sortedFiles.map(f => f.name))].map(name => sortedFiles.find(f => f.name === name)); // Remove duplicates

                renderPaginationControls();
                renderFileBrowser();
            })
            .catch(error => {
                console.error('Error loading file browser:', error);
            });
    } else if (source === 'history') {
        loadJobHistory();
    }
}

async function loadJobHistory() {
    if (!isServerUp()) {
        showModalError('Error', 'Selected server is down. Cannot fetch job history.');
        return;
    }
    
    if (isFetchingJobHistory) return;
    isFetchingJobHistory = true;
    console.log('Fetching job history');

    const serverUrl = getServerEndpoint();

    try {
        const data = await fetchWithJSON(`${serverUrl}/v1/generation/job-history`);
        console.log('Job history data:', data);

        const jobDetailsPromises = data.history.map((job, index) => {
            return fetchWithJSON(`${serverUrl}/v1/generation/query-job?job_id=${job.job_id}&require_step_preview=true`)
                .then(details => {
                    const jobResults = details.job_result ? details.job_result : [];
                    return jobResults.map(result => ({
                        job_id: job.job_id,
                        name: result.url ? result.url.split('/').pop() : null,
                        preview: result.url ? result.url : '',
                        date: new Date(index)  // Use index as date to keep order consistent
                    }));
                });
        });

        const jobs = (await Promise.all(jobDetailsPromises)).flat();
        const validJobs = jobs.filter(job => job.name); // Filter out jobs without valid images
        allFiles = [...new Set(validJobs.map(job => job.name))].map(name => validJobs.find(job => job.name === name)); // Remove duplicates

        renderPaginationControls();
        renderFileBrowser();
    } catch (error) {
        console.error('Error loading job history:', error);
    } finally {
        isFetchingJobHistory = false;
    }
}

function renderFileBrowser() {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedFiles = allFiles.slice(start, end);

    let html = '<ul>';
    paginatedFiles.forEach(file => {
        const isSelected = selectedFiles.has(file.preview);
        html += `<li class="file-browser-item ${isSelected ? 'selected' : ''}" onclick="toggleFileSelection('${file.preview}')">
                    <img src="${file.preview}" class="file-thumbnail">
                    <span class="file-label">${file.name}</span>
                 </li>`;
    });
    html += '</ul>';
    document.getElementById('file-browser').innerHTML = html;
}

function renderPaginationControls() {
    totalPages = Math.ceil(allFiles.length / itemsPerPage);
    const paginationControls = document.querySelector('.pagination-controls');
    paginationControls.innerHTML = `
        <button onclick="changePage(1)" ${currentPage === 1 ? 'disabled' : ''}>First</button>
        <button onclick="changePage(currentPage - 1)" ${currentPage === 1 ? 'disabled' : ''}>Back</button>
        Page ${currentPage} of ${totalPages}
        <button onclick="changePage(currentPage + 1)" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
        <button onclick="changePage(totalPages)" ${currentPage === totalPages ? 'disabled' : ''}>Last</button>
    `;
}

function changePage(page) {
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    currentPage = page;
    renderFileBrowser();
    renderPaginationControls();
}

function changeItemsPerPage() {
    const itemsPerPageSelect = document.getElementById('items-per-page');
    itemsPerPage = parseInt(itemsPerPageSelect.value, 10);
    currentPage = 1; // Reset to the first page
    loadFileBrowser();
    renderPaginationControls();
}

function handleSortFilesChange() {
    const sortSelect = document.getElementById('sort-files');
    const sortOption = sortSelect.value;
    const files = [...allFiles];
    allFiles = sortFiles(files, sortOption);
    currentPage = 1; // Reset to the first page
    loadFileBrowser();
    renderPaginationControls();
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
    updateSubmitButton();
}

function selectAllFiles() {
    console.log('Selecting all files');
    document.querySelectorAll('.file-browser-item').forEach(item => {
        const filePath = item.querySelector('.file-thumbnail').getAttribute('src');
        selectedFiles.add(filePath);
        item.classList.add('selected');
    });
    updateSubmitButton();
}

function unselectAllFiles() {
    console.log('Unselecting all files');
    document.querySelectorAll('.file-browser-item').forEach(item => {
        const filePath = item.querySelector('.file-thumbnail').getAttribute('src');
        selectedFiles.delete(filePath);
        item.classList.remove('selected');
    });
    updateSubmitButton();
}

function updateSubmitButton() {
    const submitButton = document.getElementById('submit-selected-files');
    const selectedCount = selectedFiles.size;
    submitButton.textContent = `Submit ${selectedCount} Image${selectedCount !== 1 ? 's' : ''} to Upscale Job`;
    submitButton.disabled = selectedCount === 0;
}

function submitSelectedFiles() {
    if (selectedFiles.size === 0) return;

    if (!isServerUp()) {
        showModalError('Error', 'Selected server is down. Cannot submit jobs.');
        return;
    }

    const settings = getSettings();
    const files = Array.from(selectedFiles);

    let submitButton = document.getElementById('submit-selected-files');
    submitButton.classList.add('dimmed');
    submitButton.disabled = true;

    let promises = files.map(file => {
        return fetchImageAsBase64(file)
            .then(imageData => {
                const timestamp = getFormattedTimestamp();
                const saveName = settings.fileName ? `${timestamp}_${settings.fileName}` : `${timestamp}`;
                return submitUpscaleJob(imageData, saveName);
            })
            .catch(error => {
                console.error('Error reading file:', error);
                showModalError('Error reading file.');
            });
    });

    Promise.all(promises)
        .then(() => {
            console.log('All jobs submitted successfully.');
            submitButton.classList.remove('dimmed');
            submitButton.disabled = false;
            submitButton.innerText = 'Upscale Job Success';
            setTimeout(() => {
                submitButton.innerText = `Submit ${selectedFiles.size} Image(s) to Upscale Job`;
                clearSelection();
            }, 2000);
        })
        .catch(error => {
            console.error('Error submitting one or more jobs:', error);
            submitButton.classList.remove('dimmed');
            submitButton.disabled = false;
            showModalError('Error', 'Failed to submit one or more upscale jobs.');
        });
}

function fetchImageAsBase64(url, retries = 3) {
    const cacheBustingUrl = `${url}?cacheBust=${Date.now()}`;
    console.log(`Attempting to fetch image from URL: ${cacheBustingUrl}`);
    return fetch(cacheBustingUrl)
        .then(response => {
            console.log(`Fetch response status: ${response.status} for URL: ${cacheBustingUrl}`);
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            return response.blob();
        })
        .then(blob => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                console.log(`Successfully read file: ${cacheBustingUrl}`);
                resolve(reader.result.split(',')[1]);
            };
            reader.onerror = () => {
                console.error(`FileReader error for file: ${cacheBustingUrl}`, reader.error);
                reject(reader.error);
            };
            reader.readAsDataURL(blob);
        }))
        .catch(error => {
            console.error(`Error fetching image from URL: ${cacheBustingUrl}`, error);
            if (retries > 0) {
                console.warn(`Retrying... (${retries} left)`);
                return new Promise(resolve => setTimeout(resolve, 3000))
                    .then(() => fetchImageAsBase64(url, retries - 1));
            } else {
                console.error('Failed to fetch image after retries', error);
                throw error;
            }
        });
}

function getFormattedTimestamp() {
    const now = new Date();
    const timestamp = now.getFullYear().toString() + 
        String(now.getMonth() + 1).padStart(2, '0') + 
        String(now.getDate()).padStart(2, '0') + '-' + 
        String(now.getHours()).padStart(2, '0') + 
        String(now.getMinutes()).padStart(2, '0') + 
        String(now.getSeconds()).padStart(2, '0');
    return timestamp;
}

function getSettings() {
    const imageNumber = document.getElementById('image-number').value;
    const upscaleStrength = document.getElementById('upscale-strength').value;
    const performanceSelection = document.getElementById('performance-selection').value;
    const uovMethod = document.getElementById('uov-method').value;
    const fileName = document.getElementById('file-name').value;

    return {
        imageNumber,
        upscaleStrength,
        performanceSelection,
        uovMethod,
        fileName
    };
}

function submitUpscaleJob(imageData, fileName) {
    const settings = getSettings();
    const apiUrl = `${getServerEndpoint()}/v2/generation/image-upscale-vary`;

    const data = {
        uov_method: settings.uovMethod,
        overwrite_upscale_strength: settings.overwrite_upscale_strength,
        performance_selection: settings.performance_selection,
        image_number: parseInt(settings.imageNumber),
        input_image: imageData,
        save_extension: 'png',
        save_name: fileName.trim(),
        async_process: true
    };

    console.log('Submitting Upscale Job:', data);

    return fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        console.log('Upscale job submitted:', result);
        return result;
    })
    .catch(error => {
        console.error('Error submitting upscale job:', error);
        showModalError('Error', 'Failed to submit upscale job.');
        throw error;
    });
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

function showModalError(title, message) {
    const modal = document.createElement('div');
    modal.classList.add('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-button">&times;</span>
            <h2>${title}</h2>
            <p>${message}</p>
        </div>
    `;
    document.body.appendChild(modal);

    const closeButton = modal.querySelector('.close-button');
    closeButton.addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.remove();
        }
    });
}

function changeImageSource() {
    const sourceSelect = document.getElementById('image-source');
    const source = sourceSelect.value;

    if (source === 'local') {
        loadFileBrowser();
    } else if (source === 'history') {
        loadJobHistory();
    }
}

function clearSelection() {
    selectedFiles.clear();
    document.querySelectorAll('.file-browser-item').forEach(item => item.classList.remove('selected'));
    updateSubmitButton();
}

window.toggleFileSelection = toggleFileSelection;
window.selectAllFiles = selectAllFiles;
window.unselectAllFiles = unselectAllFiles;
window.changeImageSource = changeImageSource;
window.loadFileBrowser = loadFileBrowser;
window.loadJobHistory = loadJobHistory;
window.submitSelectedFiles = submitSelectedFiles;
window.allowDrop = allowDrop;
window.handleDrop = handleDrop;
window.handleFiles = handleFiles;
window.handleDragEnter = handleDragEnter;
window.handleDragLeave = handleDragLeave;
window.changePage = changePage;
window.changeItemsPerPage = changeItemsPerPage;
window.handleSortFilesChange = handleSortFilesChange;
