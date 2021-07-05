const puppeteer = require('puppeteer');
const readline = require('readline');
const fs = require('fs');

function isWin() {
	if (process.platform=="win32") {
		return 1;
	} else {
		return 0;
	}
}

// Constants
const BASE_URL = "https://www.schwab.com"
const dlDir = (isWin() ? "c:\\Users\\sbsut\\Downloads\\schwab" : "/home/sbs/downloads/schwab");
const dirSep = isWin() ? "\\" : "/";


// Members
var page = null;
var browser = null;

async function initialize(headless) {

    // Create a browser inst and a page.
    browser = await puppeteer.launch({
		executablePath: (isWin() ? undefined : '/usr/bin/chromium-browser'),
        headless: headless,
        args: ['--no-sandbox','--disable-web-security'],
        ignoreDefaultArgs: ['--enable-automation']
    });

    page = await browser.newPage();
    page.setViewport( {width: 1280, height: 800} );

}

async function ask( prompt, hide ) {
	var rl = readline.createInterface({
	  input: process.stdin,
	  output: process.stdout
	});

	rl.stdoutMuted = hide;

    var promise = new Promise(resolve => {
        rl.question( prompt, function(password) {
          rl.close();
          resolve(password);
        })
    });

	rl._writeToOutput = function _writeToOutput(stringToWrite) {
	  if (rl.stdoutMuted)
		rl.output.write("*");
	  else
		rl.output.write(stringToWrite);
	};
    return promise;
}
function close() {
    browser.close();
}

async function saveScreenshot (name) {
    await page.screenshot({path: "./"+name+".png", fullPage: false});
}

async function login() {
    let loginURL = "https://client.schwab.com/Login/SignOn/CustomerCenterLogin.aspx";

	// Set the userAgent, replacing HeadlessChrome with Chrome.
	let userAgent = await browser.userAgent();
	userAgent = userAgent.replace('HeadlessChrome','Chrome');
	await page.setUserAgent( userAgent );

    // Navigate to the main page.
    await page.goto( loginURL, {waitUntil: "networkidle2"});


    let keepTrying = true;
    var pwdOK = false;
    let success = false;
    while (keepTrying) {
        try {
            if (!pwdOK) {
                // The login boxes are inside an iframe.
                let loginFrame = await page.waitForSelector('iframe[id=lmsSecondaryLogin]');
                let frameContent = await loginFrame.contentFrame();
                let usernameBox = await frameContent.waitForSelector('input[id=LoginId]');

                // Fill in username.
                await page.waitForTimeout(1000);
                await usernameBox.click();
                await usernameBox.type("sbsuth0",{delay: 100});

                // Prompt for pwd and fill it in, and press the Login button.
                const pwd = await ask("Password: ",true);
                await frameContent.type('input[id=Password]',pwd,{delay: 100});
                loginButton = await frameContent.waitForSelector('button[id=LoginSubmitBtn]');
                loginButton.click();

                await page.waitForNavigation({timeout: 10000});
                await page.waitForTimeout(1000);

                // Click the radios to ask for a text to 7661
                // If pwd was wrong, this will timeout, and we'll go to the catch
                let smsId = await page.waitForSelector('input[id=SmsId]',{timeout: 3000});
                pwdOK = true;
                smsId.click();
                await page.waitForTimeout(1000);
                let sms2 = await page.waitForSelector('input[id=Sms2]',{timeout: 1000});
                sms2.click();
                await page.waitForTimeout(1000);
                let submit = await page.waitForSelector('input[id=Submit]',{timeout: 1000});
                submit.click();
                await page.waitForNavigation();
                await page.waitForTimeout(1000);
            }
            // Prompt for the PIN, fill it in and submit.
            let pinNumber = await page.waitForSelector('input[id=PinNumber]',{timeout: 1000});
            const pin = await ask("Pin: ",false);
            await pinNumber.type(pin,{delay: 50});
            submit = await page.waitForSelector('input[id=Submit]',{timeout: 1000});
            submit.click();
            await page.waitForNavigation({timeout: 3000}); // If PIN is wrong, this will timeout.

            // There's a confirmation page.  We must hit its Submit.
            submit = await page.waitForSelector('input[id=Submit]',{timeout: 1000});
            submit.click();
            await page.waitForNavigation();
            await page.waitForTimeout(1000);

            try {
                // Sometimes there's a popup we need to dismiss.
                let msgClose = await page.waitForSelector("div.new-experience-modal-header > button",{timeout: 1000});
                msgClose.click();
                keepTrying = false;
                success = true;
            } catch (e) {}
        } catch (e) {
            try {
                if (pwdOK) {
                    // PIN bad
                    console.log("Bad PIN: retry");
                    await page.waitForSelector('#SuaMessageBoxContents',{timeout: 5000});
                } else {
                    // PWD bad
                    console.log("Bad password: retry: "+e);
                    let loginFrame = await page.waitForSelector('iframe[id=lmsSecondaryLogin]');
                    let frameContent = await loginFrame.contentFrame();
                    await frameContent.waitForSelector('span[id=lms-ar-error-message]',{timeout: 5000});
                }
                keepTrying = true;
            } catch (e) {
                console.log("ERROR: cant find password error: quit");
                keepTrying = false;
            }
        }
    }
    if (success) {
        console.log("SUCCESS: Were in!");
    } else {
        console.log("FAIL: We failed");
    }
    return success;
}

// Press a button that starts a file download, monitor responses, looking for
// an attachment, and resolve when the attached file reaches its full size.
// Returns the path of the file.
const downloadPositionsFile = (btn,dir,timeout) => {
    // Must do the click and monitor responses immediately to make sure we don't miss any.
    btn.click();
    return Promise.race([
        new Promise( resolve => {
            page.on('response', response => {
                const disp = response._headers['content-disposition'];
                const re=/attachment; filename=(All-Accounts-Positions-.*CSV)/;
                const rslt = disp.match(re);
                if (rslt && (rslt.length > 0)) {
                    const fn = rslt[rslt.length-1];
                   // Get the size
                   let sz = parseInt(response._headers['content-length']);
                   // Watch event on download folder or file
                   fs.watchFile(dir+dirSep+fn, function (curr, prev) {
                       // If current size eq to size from response then close
                        if (parseInt(curr.size) === sz) {
                            let downloadPath = dir + '/' +  fn;
                            resolve(downloadPath);
                        }
                    });
                }
            })
        }),
        page.waitForTimeout(timeout)
    ]);
};

async function downloadPositions() {

    // Set the download dir.
    await page._client.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: dlDir});

    // Navigate to the Positions page.
    let positionsURL = "https://client.schwab.com/Areas/Accounts/Positions"
    await page.goto( positionsURL, {waitUntil: "networkidle2"});
    await page.waitForTimeout(1000);
    let download = await page.waitForSelector("#exportLink > a > i");
    download.click();
    await page.waitForTimeout(1000);

    const pages = await browser.pages();
    const popup = pages[pages.length - 1];

    let ok = await popup.waitForSelector("#ctl00_WebPartManager1_wpExportDisclaimer_ExportDisclaimer_btnOk");
    await page.waitForTimeout(1000);

    let downloadPath = await downloadPositionsFile(ok,dlDir,10000);

    return downloadPath;
}

module.exports = {
    initialize: initialize,
    close: close,
    login: login,
    downloadPositions: downloadPositions
};
