const puppeteer = require('puppeteer');

// Constants
const BASE_URL = "https://www.portfoliovisualizer.com"

// Members
var page = null;
var browser = null;

async function initialize(headless) {

    // Create a browser inst and a page.
    browser = await puppeteer.launch({
        headless: headless
    });

    page = await browser.newPage();
}

async function login() {
    // Navigate to the main page.
    await page.goto( BASE_URL, {waitUntil: "networkidle2"});

    let loginButton = await page.$x('//a[contains(text(),"Log In")]');
    await loginButton[0].click();

    loginButton = await page.waitForSelector('input[value="Login"]');
    await page.type('input[name="username"]',"sbsuth@comcast.net",{delay: 50});
    await page.type('input[name="password"]',"DontLightCat!",{delay: 50});
    loginButton.click();
}

module.exports = {
    initialize: initialize,
    login: login
};
