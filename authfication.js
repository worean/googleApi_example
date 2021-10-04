const { OAuth2Client } = require("google-auth-library");
const {google } = require("googleapis");


export const getTokenWithRefresh = (secret, refreshToken) => {
    let oauthClient = new google.auth.OAuth2(
        secret.clientId,
        secret.clientSecret,
        secret.redirectUris
    )

    oauth2Client.credentials.refresh_token = refreshToken;

    oauth2Client.refreshAccessToken((error, tokens) => {
        if (!error) {

        }
    });
}