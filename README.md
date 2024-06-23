
# fooocus-api-ui

**fooocus-api-ui** is a web application that interfaces with the Fooocus API to allow users to upscale images, face-swap with ease, and manage job submissions efficiently. This user-friendly application provides features such as drag-and-drop file uploads, job history management, pagination, sorting, and more.

## Table of Contents

- [Features](#features)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Scripts](#scripts)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Drag and Drop Uploads:** Easily upload images by dragging and dropping them into the interface.
- **File Browser:** Browse and select images from local files or job history.
- **Sorting:** Sort images by name or date to quickly find what you need.
- **Pagination:** Navigate through images with customizable items per page.
- **Bulk Selection:** Select or unselect all images with a single click.
- **Upscale Job Submission:** Submit selected images for upscaling.
- **Job History:** View detailed history of submitted jobs, including job status and results.
- **Stop Jobs:** Stop all running jobs and monitor the stop status.
- **Predefined Images for Face Swap:** Utilize predefined images for face swap operations.
- **Bulk Adding Items:** Bulk add items to the Fooocus-API for efficient processing.

## Usage

### Home Page

- Access the main dashboard to navigate to different functionalities through the navigation bar.

### Adding an Upscale Job

1. **Navigate:** Go to the "Add Upscale Job" page.
2. **Upload:** Drag and drop images into the upload area or click to select files.
3. **Configure:** Set the parameters for the upscaling job.
4. **Submit:** Click "Submit Selected Files" to initiate the upscaling process.

### Predefined Images for Face Swap

1. **Navigate:** Go to the "Add Face Swap Job" page.
2. **Select Predefined Image:** Choose from a list of predefined images for the face swap operation.
3. **Upload Target Images:** Drag and drop target images or click to select files.
4. **Submit:** Click "Submit Face Swap Job" to start the face swap process.

### Bulk Adding Items

1. **Navigate:** Go to the "Bulk Add Items" page.
2. **Upload:** Drag and drop multiple images or select files.
3. **Submit:** Click "Submit Bulk Items" to add all selected items to the Fooocus-API for processing.

### Job History

- **View History:** Go to the "Job History" page to see the list of previously submitted jobs.
- **Pagination:** Use pagination controls to navigate through different pages.
- **Sort:** Utilize the sort dropdown to sort jobs by date or other criteria.

### Stopping All Jobs

- **Stop Jobs:** Go to the "Stop All Jobs" page and click the "Stop All Jobs" button to stop all active jobs.
- **Monitor:** Check the stop status and view details of stopped jobs.

## API Endpoints

### `/config`

- **Method:** GET
- **Description:** Fetches the server configuration.

### `/browse?dir=<directory>`

- **Method:** GET
- **Description:** Fetches the list of files in the specified directory.



## Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## License

This project is licensed under the AGPL-3.0 license.
