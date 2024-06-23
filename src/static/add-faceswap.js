import { fetchWithJSON, setRefreshInterval, initializeServerSelection, updateServerStatus, getServerEndpoint, isServerUp } from './common.js';

document.addEventListener('DOMContentLoaded', function() {
    console.log('Add Face Swap Job page loaded');

    fetch('/config')
        .then(response => response.json())
        .then(config => {
            console.log('Server config:', config);
            initializeServerSelection(config);
            updateServerStatus(config);
            setRefreshInterval(() => updateServerStatus(config), 30000);
        })
        .catch(error => {
            console.error('Error fetching config:', error);
        });

    loadFaceSwapImages();

    document.getElementById('image-number').addEventListener('input', updateImageNumberValue);
    document.getElementById('image-number-value').addEventListener('input', updateImageNumberRange);

    document.getElementById('faceswap-form').addEventListener('submit', function(event) {
        event.preventDefault();
        addFaceSwapJob();
    });
});

function loadFaceSwapImages() {
    fetch('/api/faceswap/images')
        .then(response => response.json())
        .then(data => {
            const imageSelectionDiv = document.getElementById('image-selection');
            if (!imageSelectionDiv) {
                console.error('Image selection div not found.');
                return;
            }

            imageSelectionDiv.innerHTML = '';
            data.images.forEach(image => {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'file-browser-item';

                const imgElement = document.createElement('img');
                imgElement.src = `/faceswap_images/${image}`;
                imgElement.alt = image;
                imgElement.className = 'file-thumbnail';
                imgElement.style.width = '150px';
                imgElement.style.height = '150px';
                imgElement.style.objectFit = 'cover';
                imgElement.onclick = (event) => selectImage(image, event);

                imgContainer.appendChild(imgElement);
                imageSelectionDiv.appendChild(imgContainer);
            });
        })
        .catch(error => {
            console.error('Error loading face swap images:', error);
        });
}

function selectImage(imageName, event) {
    const selectedImageDiv = document.getElementById('selected-image');
    if (!selectedImageDiv) {
        console.error('Selected image div not found.');
        return;
    }

    selectedImageDiv.innerHTML = `<p><strong>Selected Image:</strong> ${imageName}</p>`;
    selectedImageDiv.dataset.selectedImage = imageName;

    document.querySelectorAll('.file-browser-item').forEach(container => {
        container.classList.remove('selected');
    });
    event.currentTarget.parentNode.classList.add('selected');
}

function toggleSeedInput() {
    const seedInput = document.getElementById('seed');
    if (!seedInput) {
        console.error('Seed input not found.');
        return;
    }

    const randomSeed = document.getElementById('random-seed').checked;
    seedInput.readOnly = randomSeed;
    seedInput.classList.toggle('read-only', randomSeed);
    if (randomSeed) {
        seedInput.value = 0;
    }
}

function updateStopAtValue() {
    const stopAt = document.getElementById('stop-at');
    const stopAtValue = document.getElementById('stop-at-value');
    if (!stopAt || !stopAtValue) {
        console.error('Stop At input not found.');
        return;
    }
    stopAtValue.value = stopAt.value;
}

function updateStopAtRange() {
    const stopAtValue = document.getElementById('stop-at-value');
    const stopAt = document.getElementById('stop-at');
    if (!stopAt || !stopAtValue) {
        console.error('Stop At value input not found.');
        return;
    }
    stopAt.value = stopAtValue.value;
}

function updateWeightValue() {
    const weight = document.getElementById('weight');
    const weightValue = document.getElementById('weight-value');
    if (!weight || !weightValue) {
        console.error('Weight input not found.');
        return;
    }
    weightValue.value = weight.value;
}

function updateWeightRange() {
    const weightValue = document.getElementById('weight-value');
    const weight = document.getElementById('weight');
    if (!weight || !weightValue) {
        console.error('Weight value input not found.');
        return;
    }
    weight.value = weightValue.value;
}

function updateImageNumberValue() {
    const imageNumber = document.getElementById('image-number');
    const imageNumberValue = document.getElementById('image-number-value');
    if (!imageNumber || !imageNumberValue) {
        console.error('Image number input not found.');
        return;
    }
    imageNumberValue.value = imageNumber.value;
}

function updateImageNumberRange() {
    const imageNumber = document.getElementById('image-number');
    const imageNumberValue = document.getElementById('image-number-value');
    if (!imageNumber || !imageNumberValue) {
        console.error('Image number input not found.');
        return;
    }
    imageNumber.value = imageNumberValue.value;
}

function generateSaveName(userProvidedName) {
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 10).replace(/-/g, '') + '-' +
                      now.toLocaleTimeString('en-US', { hour12: false }).replace(/:/g, '');
    if (userProvidedName) {
        return `${timestamp}_${userProvidedName}`;
    } else {
        return timestamp;
    }
}

function showModalError(message) {
    const modal = document.createElement('div');
    modal.classList.add('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-button">&times;</span>
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

function addFaceSwapJob() {
    console.log('Starting addFaceSwapJob');

    if (!isServerUp()) {
        showModalError('The selected server is down. Please select a different server.');
        return;
    }

    const selectedImage = document.getElementById('selected-image').dataset.selectedImage;
    if (!selectedImage) {
        showModalError('Please select an image before submitting the job.');
        return;
    }

    const prompt = document.getElementById('text-prompt').value;
    const fileName = generateSaveName(document.getElementById('file-name').value);
    const aspectRatio = document.getElementById('aspect-ratios').value;
    const outputFormat = document.getElementById('output-format').value;
    const saveMetaValue = document.getElementById('save-meta').value;
    const randomSeedCheckbox = document.getElementById('random-seed').checked;
    const seedInput = document.getElementById('seed').value;
    const stopAt = parseFloat(document.getElementById('stop-at').value);
    const weight = parseFloat(document.getElementById('weight').value);
    const imageNumber = parseInt(document.getElementById('image-number').value, 10);
    const quality = document.getElementById('quality').value;

    const submitButton = document.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.style.opacity = 0.5;

    const serverEndpoint = getServerEndpoint();
    fetch(`/faceswap_images/${selectedImage}`)
        .then(response => response.blob())
        .then(blob => {
            const reader = new FileReader();
            reader.onloadend = function() {
                const imageData = reader.result.split(',')[1];

                const faceSwapData = {
                    prompt,
                    save_extension: outputFormat,
                    save_name: fileName,
                    aspect_ratios_selection: aspectRatio,
                    save_meta: saveMetaValue !== 'no',
                    meta_scheme: saveMetaValue.split(' ')[0].toLowerCase(),
                    seed: randomSeedCheckbox ? 0 : parseInt(seedInput, 10),
                    stop_at: stopAt,
                    weight,
                    image_number: imageNumber,
                    async_process: true,
                    performance_selection: quality,
                    image_prompts: [{
                        cn_img: imageData,
                        cn_stop: stopAt,
                        cn_weight: weight,
                        cn_type: "FaceSwap"
                    }]
                };

                console.log('Submitting Face Swap data:', faceSwapData);

                fetchWithJSON(`${serverEndpoint}/v2/generation/image-prompt`, 'POST', faceSwapData)
                .then(data => {
                    console.log('Face swap job submitted:', data);
                    submitButton.textContent = 'Face Swap Job Success';
                    submitButton.classList.add('success');
                    setTimeout(() => {
                        submitButton.textContent = originalButtonText;
                        submitButton.disabled = false;
                        submitButton.style.opacity = 1;
                        submitButton.classList.remove('success');
                    }, 2000);
                })
                .catch(error => {
                    console.error('Error adding Face Swap job:', error);
                    showModalError('Error adding Face Swap job.');
                    submitButton.disabled = false;
                    submitButton.style.opacity = 1;
                });
            };
            reader.readAsDataURL(blob);
        })
        .catch(error => {
            console.error('Error fetching selected image data:', error);
            showModalError('Error fetching selected image data.');
            submitButton.disabled = false;
            submitButton.style.opacity = 1;
        });
}
