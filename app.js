const express = require('express')
const app = express()
const port = 4000
const { google } = require("googleapis")
const request = require("request")
const fs = require("fs");
const readline = require("readline")
const AWS = require("aws-sdk")




app.get('/', (req, res) => {
    // Query에 있는 code를 가져온다.
    console.log(req.query.code);
    res.send("hello world");
});

app.get('redirect', (req, res) => {
    console.log(req);
    console.log(res);
    res.send("hello world");
});


app.listen(port, () => {
    console.log("service is open : ", port);
});

// 토큰 저장 경로
const TOKEN_PATH = "./token.json";
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly',
    "https://www.googleapis.com/auth/drive"];

fs.readFile('./credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Sheets API.
    authorize(JSON.parse(content), listGoogleDriveFiles);
})

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.web;
    console.log(credentials.web);
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[1]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error while trying to retrieve access token', err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

// /**
//  * Prints the names and majors of students in a sample spreadsheet:
//  * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
//  * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
//  */
// function listMajors(auth) {
//     const sheets = google.sheets({ version: 'v4', auth });
//     sheets.spreadsheets.values.get({
//         spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
//         range: 'Class Data!A2:E',
//     }, (err, res) => {
//         if (err) return console.log('The API returned an error: ' + err);
//         const rows = res.data.values;
//         if (rows.length) {
//             console.log('Name, Major:');
//             // Print columns A and E, which correspond to indices 0 and 4.
//             rows.map((row) => {
//                 console.log(`${row[0]}, ${row[4]}`);
//             });
//         } else {
//             console.log('No data found.');
//         }
//     });
// }


function listGoogleDriveFiles(auth) {
    let pageToken = null;
    const drive = google.drive({
        version: 'v3', auth
    });
    drive.files.list({
        q: "mimeType='video/mp4'",
        fields: 'nextPageToken, files(id, name, owners,hasThumbnail,thumbnailLink )',
        supportsAllDrives: true,
        spaces: 'drive',
        pageToken
    }, (err, res) => {
        if (err)
            return console.log("Drive.Files.List() returned Error : ", err);
        else {
            res.data.files.map(async (file) => {
                // 비동기 방식으로 진행해야 다른 작업을 수행가능하다.
                integrateGoogleDriveToS3(auth, file.id);
                console.log(`File drive:${file.id}`);
                console.log(file.owners[0].emailAddress);
            });
            pageToken = res.nextPageToken;
        }
    });
}

/**
 * S3버킷에 대한 정보를 기반으로 Google API를 이용해서 지정된 폴더안의 영상파일을 S3로 업로드한다.
 * @param {google.auth.OAuth2} auth 
 * @param {string} fileId 
 * @param {string} bucket 
 */
async function integrateGoogleDriveToS3(auth, fileId) {

    let pageToken = null;
    const drive = google.drive({
        version: 'v3', auth
    });
    const readStream = await drive.files.get({ fileId, alt: 'media' }, {
        responseType: 'stream'
    });
    if (readStream) {
        await uploadS3Server(readStream, 111, "drivetest");
    }
}

/**
 * 
 * @param {*} drive 
 * @param {*} fileId 
 * @returns 
 */
async function deleteGoogleDriveFile(auth, fileId) {
    const drive = google.drive({
        version: 'v3', auth
    });
    return drive.files.delete({
        fileId
    });
}

// S3 Server API를 이용해서 S3에 이미지를 올린다.
const uploadS3Server = async (stream, userId, path, args) => {
    AWS.config.update({
        credentials: {
            accessKeyId: "AKIA3HQZAUKCKERUZV54",
            secretAccessKey: "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",
        },
    });
    console.log("uploadFile : ", stream);

    const extention = stream.headers['content-type']
    const objectName = `${path}/${userId}-${Date.now()}`;
    const upload = await new AWS.S3()
        .upload({
            Bucket: "basket8006",
            Key: objectName,
            ACL: "public-read",
            ContentType:stream.headers['content-type'],
            Body: stream.data,
        })
        .promise();
    return upload.Location;
};