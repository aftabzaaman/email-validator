// server.js
const express = require('express');
const fileUpload = require('express-fileupload');
const Papa = require('papaparse');
const path = require('path');
const dns = require('dns').promises; // Node.js built-in DNS module
const emailRegex = require('email-regex-safe');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(fileUpload());

// --- Serve your frontend HTML file ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- This is the endpoint your frontend will call ---
app.post('/process-files', async (req, res) => {
    
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.');
    }

    const file = req.files.file; // 'file' must match the name in your FormData

    // 1. Parse the uploaded file to get emails
    const emails = await getEmailsFromFile(file.data);
    if (emails.length === 0) {
        return res.status(400).send('No valid emails found in the file.');
    }

    // 2. Verify each email (Syntax and MX)
    const results = [];
    for (const email of emails) {
        const result = { email: email, status: 'Invalid', reason: 'N/A' };

        // Check 1: Syntax
        if (!emailRegex().test(email)) {
            result.status = 'Invalid';
            result.reason = 'Invalid Syntax';
            results.push(result);
            continue; // Go to next email
        }

        // Check 2: MX Records
        const domain = email.split('@')[1];
        try {
            const records = await dns.resolveMx(domain);
            
            if (records && records.length > 0) {
                result.status = 'Valid (Domain)';
                result.reason = 'Mail server exists';
            } else {
                result.status = 'Invalid';
                result.reason = 'No MX records found';
            }
        } catch (error) {
            result.status = 'Invalid';
            result.reason = 'Domain does not exist';
        }
        
        results.push(result);
    }

    // 3. Convert results back to a CSV string
    const csvResult = Papa.unparse(results);

    // 4. Send the CSV file back to the user for download
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', 'attachment; filename=partial_results.csv');
    res.send(csvResult);
});

// Helper function to parse emails from a file buffer
function getEmailsFromFile(fileData) {
    const fileContent = fileData.toString('utf8');
    const lines = fileContent.split('\n');
    const emails = lines
        .map(line => line.split(',')[0].trim()) // Gets first "column" and trims it
        .filter(email => email.length > 0 && email.includes('@')) // Basic filter
        .filter((email, index, self) => self.indexOf(email) === index); // Remove duplicates
    return Promise.resolve(emails);
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
