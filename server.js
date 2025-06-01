// server.js
// Main application for the Enhanced Node.js deployment platform (v3)

const express = require('express');
const fs = require('fs');
const path = require('path');
const morgan = require('morgan'); // HTTP request logger
// const { exec, spawn } = require('child_process'); // For running user code - USE WITH EXTREME CAUTION & SANDBOXING

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuration ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Middleware ---
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Project Storage & Status ---
const projectsBaseDir = path.join(__dirname, 'projects');
if (!fs.existsSync(projectsBaseDir)) {
    fs.mkdirSync(projectsBaseDir, { recursive: true });
    console.log(`Created projects directory at: ${projectsBaseDir}`);
}

// In-memory store for conceptual project statuses.
// In a real app, this would be persisted (e.g., in a database).
let projectStatusStore = {}; // Example: { "projectName": "Stopped" }

// --- Helper Functions ---
function getProjectDetails(projectName) {
    const projectDir = path.join(projectsBaseDir, projectName);
    if (!fs.existsSync(projectDir)) {
        return null;
    }
    let packageJson = null;
    try {
        const packageJsonContent = fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8');
        packageJson = JSON.parse(packageJsonContent);
    } catch (e) {
        // Non-critical if package.json is missing or malformed for basic listing
        console.warn(`Warning: Could not read or parse package.json for ${projectName}:`, e.message);
    }

    let files = [];
    try {
        files = fs.readdirSync(projectDir).map(file => {
            const filePath = path.join(projectDir, file);
            const stat = fs.statSync(filePath);
            return {
                name: file,
                isDirectory: stat.isDirectory(),
                size: stat.size,
                lastModified: stat.mtime
            };
        });
    } catch (e) {
        console.error(`Error reading files for ${projectName}:`, e);
    }
    
    let entryHtml = '';
    const entryHtmlPath = path.join(projectDir, '.entryHtml');
    if (fs.existsSync(entryHtmlPath)) {
        try {
            entryHtml = fs.readFileSync(entryHtmlPath, 'utf8').trim();
        } catch (e) {
            console.error(`Error reading .entryHtml for ${projectName}:`, e);
        }
    }

    const mainScript = (packageJson && packageJson.main) || 'app.js'; // Default to app.js

    return {
        name: projectName,
        path: projectDir,
        packageJson: packageJson,
        files: files,
        entryHtml: entryHtml,
        mainScript: mainScript,
        createdAt: fs.statSync(projectDir).birthtime,
        status: projectStatusStore[projectName] || "Saved" // Default status
    };
}

function sanitizeProjectName(projectName) {
    return projectName.replace(/[^a-zA-Z0-9-_]/g, '');
}

// --- Routes for the Platform UI ---

// Home / Dashboard
app.get('/', (req, res) => {
    fs.readdir(projectsBaseDir, { withFileTypes: true }, (err, files) => {
        if (err) {
            console.error("Error reading projects directory:", err);
            return res.status(500).render('index', {
                pageTitle: 'Dashboard',
                projects: [],
                error: 'Could not load projects.',
                success: null
            });
        }
        const projectNames = files
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        const projectsData = projectNames.map(name => getProjectDetails(name)).filter(p => p !== null);

        res.render('index', {
            pageTitle: 'Dashboard',
            projects: projectsData,
            error: req.query.error, // Pass error/success messages from redirects
            success: req.query.success
        });
    });
});

// Deploy Page (GET)
app.get('/deploy', (req, res) => {
    res.render('deploy', { pageTitle: 'Deploy New Project', error: null, success: null });
});

// Handle Project Deployment (POST)
app.post('/deploy', (req, res) => {
    const { projectName, packageJsonContent, mainJsContent, entryHtmlFile } = req.body;

    if (!projectName || !packageJsonContent || !mainJsContent) {
        return res.status(400).render('deploy', {
            pageTitle: 'Deploy New Project',
            error: 'Project Name, package.json content, and Main JS content are required.',
            success: null,
            formData: req.body
        });
    }

    const safeProjectName = sanitizeProjectName(projectName);
    if (!safeProjectName) {
        return res.status(400).render('deploy', {
            pageTitle: 'Deploy New Project',
            error: 'Invalid Project Name. Use only letters, numbers, hyphens, and underscores.',
            success: null,
            formData: req.body
        });
    }

    const projectDir = path.join(projectsBaseDir, safeProjectName);

    if (fs.existsSync(projectDir)) {
        return res.status(400).render('deploy', {
            pageTitle: 'Deploy New Project',
            error: `Project "${safeProjectName}" already exists. Choose a different name.`,
            success: null,
            formData: req.body
        });
    }

    try {
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'package.json'), packageJsonContent);
        
        // Determine main script name from package.json, default to app.js
        let mainFileName = 'app.js';
        try {
            const parsedPackageJson = JSON.parse(packageJsonContent);
            if (parsedPackageJson.main) {
                mainFileName = path.basename(parsedPackageJson.main); // Use only filename
            }
        } catch (parseErr) {
            console.warn("Could not parse package.json for main script name during deploy:", parseErr.message);
        }
        fs.writeFileSync(path.join(projectDir, mainFileName), mainJsContent);

        if (entryHtmlFile && entryHtmlFile.trim() !== '') {
            fs.writeFileSync(path.join(projectDir, '.entryHtml'), entryHtmlFile.trim());
        }
        projectStatusStore[safeProjectName] = "Saved"; // Initial status

        // --- !!! DANGER ZONE: Running User Code (Conceptual) !!! ---
        // Actual 'npm install' or code execution is highly insecure without sandboxing.
        // This section remains conceptual.
        /*
        console.log(`CONCEPTUAL: Would attempt to install dependencies for ${safeProjectName}...`);
        // const npmInstall = spawn('npm', ['install'], { cwd: projectDir, shell: true, stdio: 'pipe' });
        */
        // --- END DANGER ZONE ---

        res.redirect(`/?success=Project "${safeProjectName}" deployed successfully!`);

    } catch (err) {
        console.error("Error during project deployment:", err);
        res.status(500).render('deploy', {
            pageTitle: 'Deploy New Project',
            error: 'Failed to deploy project. Server error: ' + err.message,
            success: null,
            formData: req.body
        });
    }
});

// Project Detail Page
app.get('/project/:projectName', (req, res) => {
    const safeProjectName = sanitizeProjectName(req.params.projectName);
    const project = getProjectDetails(safeProjectName);

    if (!project) {
        return res.status(404).render('404', { pageTitle: 'Project Not Found' });
    }
    res.render('project-details', { 
        pageTitle: `Details: ${project.name}`, 
        project,
        error: req.query.error,
        success: req.query.success
    });
});

// --- Conceptual Project Control Routes ---
app.post('/project/:projectName/start', (req, res) => {
    const safeProjectName = sanitizeProjectName(req.params.projectName);
    if (!getProjectDetails(safeProjectName)) return res.status(404).redirect(`/?error=Project ${safeProjectName} not found.`);
    
    projectStatusStore[safeProjectName] = "Running"; // Conceptual: Mark as running
    console.log(`CONCEPTUAL: Project "${safeProjectName}" marked as 'Running'. NO ACTUAL CODE IS EXECUTED.`);
    // In a real system: spawn child process, manage ports, etc. EXTREMELY DANGEROUS.
    res.redirect(`/project/${safeProjectName}?success=Project ${safeProjectName} is now (conceptually) Running.`);
});

app.post('/project/:projectName/stop', (req, res) => {
    const safeProjectName = sanitizeProjectName(req.params.projectName);
    if (!getProjectDetails(safeProjectName)) return res.status(404).redirect(`/?error=Project ${safeProjectName} not found.`);

    projectStatusStore[safeProjectName] = "Stopped"; // Conceptual: Mark as stopped
    console.log(`CONCEPTUAL: Project "${safeProjectName}" marked as 'Stopped'. NO ACTUAL PROCESS IS KILLED.`);
    // In a real system: kill child process.
    res.redirect(`/project/${safeProjectName}?success=Project ${safeProjectName} is now (conceptually) Stopped.`);
});

app.post('/project/:projectName/delete', (req, res) => {
    const safeProjectName = sanitizeProjectName(req.params.projectName);
    const project = getProjectDetails(safeProjectName);

    if (!project) {
        return res.status(404).redirect(`/?error=Project ${safeProjectName} not found for deletion.`);
    }

    try {
        fs.rmSync(project.path, { recursive: true, force: true });
        delete projectStatusStore[safeProjectName];
        console.log(`Project "${safeProjectName}" deleted successfully from ${project.path}.`);
        res.redirect(`/?success=Project "${safeProjectName}" has been deleted.`);
    } catch (err) {
        console.error(`Error deleting project "${safeProjectName}":`, err);
        res.redirect(`/project/${safeProjectName}?error=Failed to delete project: ${err.message}`);
    }
});

// --- Conceptual File Editing Routes ---
app.get('/project/:projectName/edit/:fileName', (req, res) => {
    const safeProjectName = sanitizeProjectName(req.params.projectName);
    const fileName = path.basename(req.params.fileName); // Basic sanitization
    const project = getProjectDetails(safeProjectName);

    if (!project) {
        return res.status(404).render('404', { pageTitle: 'Project Not Found' });
    }

    const filePath = path.join(project.path, fileName);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return res.status(404).render('404', { pageTitle: 'File Not Found' });
    }

    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        res.render('edit-file', {
            pageTitle: `Edit ${fileName} - ${project.name}`,
            project,
            fileName,
            fileContent,
            error: null,
            success: null
        });
    } catch (err) {
        console.error(`Error reading file ${fileName} for editing:`, err);
        res.redirect(`/project/${safeProjectName}?error=Could not read file ${fileName} for editing.`);
    }
});

app.post('/project/:projectName/edit/:fileName', (req, res) => {
    const safeProjectName = sanitizeProjectName(req.params.projectName);
    const fileName = path.basename(req.params.fileName);
    const { fileContent } = req.body;
    const project = getProjectDetails(safeProjectName);

    if (!project) {
        return res.status(404).render('404', { pageTitle: 'Project Not Found' });
    }

    const filePath = path.join(project.path, fileName);
     if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) { // Check again before writing
        return res.status(404).render('edit-file', {
            pageTitle: `Edit ${fileName} - ${project.name}`,
            project, fileName, fileContent: req.body.fileContent, // Show submitted content back
            error: 'File not found or is a directory. Cannot save.', success: null
        });
    }

    try {
        fs.writeFileSync(filePath, fileContent);
        res.render('edit-file', { // Re-render with success
            pageTitle: `Edit ${fileName} - ${project.name}`,
            project,
            fileName,
            fileContent,
            success: `File ${fileName} saved successfully!`,
            error: null
        });
    } catch (err) {
        console.error(`Error writing file ${fileName}:`, err);
        res.render('edit-file', { // Re-render with error
            pageTitle: `Edit ${fileName} - ${project.name}`,
            project,
            fileName,
            fileContent, // Show submitted content back
            error: `Error saving file: ${err.message}`,
            success: null
        });
    }
});


// Logs Page (Placeholder)
app.get('/logs', (req, res) => {
    res.render('logs', { pageTitle: 'Project Logs' });
});

// Pages Page (Placeholder - could be for managing static sites or specific project pages)
app.get('/pages', (req, res) => {
    res.render('pages', { pageTitle: 'Manage Site Pages' });
});

// New Configuration Page (Placeholder)
app.get('/configure', (req, res) => {
    res.render('configure', { pageTitle: 'Platform Configuration' });
});


// --- Serving Deployed User Projects ---
// This should be the LAST set of app.use() routes for general project serving
app.use('/:projectName', (req, res, next) => {
    const projectName = sanitizeProjectName(req.params.projectName);
    const projectDir = path.join(projectsBaseDir, projectName);

    if (fs.existsSync(projectDir) && fs.lstatSync(projectDir).isDirectory()) {
        const projectDetails = getProjectDetails(projectName);
        // Only serve if project is conceptually "Running" or "Saved" (for static sites)
        // This is a conceptual check. Real security/isolation is needed for actual execution.
        if (projectDetails && (projectDetails.status === 'Running' || projectDetails.status === 'Saved')) {
            const entryHtmlPath = path.join(projectDir, '.entryHtml');
            let serveFile = req.path === '/' || req.path === '' ? 'index.html' : req.path;

            if (req.path === '/' || req.path === '') { // Root of the project
                if (fs.existsSync(entryHtmlPath)) {
                    try {
                        const customEntryFile = fs.readFileSync(entryHtmlPath, 'utf8').trim();
                        if (customEntryFile) serveFile = customEntryFile;
                    } catch (readErr) { console.error(`Error reading .entryHtml for ${projectName}:`, readErr); }
                }
            }
            
            const filePath = path.join(projectDir, serveFile.startsWith('/') ? serveFile.substring(1) : serveFile);

            if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
                 return res.sendFile(filePath);
            } else {
                // If not a direct file match, try to serve as static (e.g. for assets within the project)
                // This also handles the case where index.html is not the entryHtml but is requested directly.
                return express.static(projectDir)(req, res, next);
            }
        } else if (projectDetails && projectDetails.status === 'Stopped') {
            // If project is "Stopped", show a specific message instead of 404 or serving files.
            // This is a more user-friendly way to indicate the app is not active.
            return res.status(503).send(`
                <body style="font-family: sans-serif; padding: 20px; background-color: #f0f0f0; text-align: center;">
                    <h1>Project '${projectName}' is Currently Stopped</h1>
                    <p>This application is deployed but not currently running. It needs to be started from the NodeDeploy Pro dashboard.</p>
                    <p><a href="/">Go to Dashboard</a></p>
                </body>
            `);
        } else {
            // Project exists but status is unknown or invalid for serving
            next();
        }
    } else {
        next(); // Project directory doesn't exist, proceed to 404 or other routes
    }
});


// --- 404 Handler ---
app.use((req, res, next) => {
    res.status(404).render('404', { pageTitle: 'Page Not Found' });
});

// --- Error Handler ---
app.use((err, req, res, next) => {
    console.error("Global error handler:", err.stack);
    res.status(500).render('error', { pageTitle: 'Server Error', message: err.message || 'Something went wrong on the server.' });
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Enhanced deployment platform (v3) server running on http://localhost:${PORT}`);
    console.log(`Projects will be stored in: ${projectsBaseDir}`);
    console.warn("SECURITY WARNING: 'Start/Stop' features are CONCEPTUAL and DO NOT execute or manage actual processes. Real code execution requires robust sandboxing (e.g., Docker) and security measures not implemented in this demo.");
});
