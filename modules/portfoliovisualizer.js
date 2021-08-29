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
    await page.waitForNavigation({timeout: 10000});

    try {
        let steve = await page.waitForSelector('#navbar > ul > li:nth-child(6) > div > button',{timeout: 3000});
        const text = await page.evaluate(steve => steve.textContent, steve);
        if (text.trim() == "Stephen") {
            return true;
        } else {
            return false;
        }
        return true;
    } catch (e) {
        console.log(e);
        return false;
    }
}

async function pickDropdown( id, offset )
{
    let button = await page.waitForSelector('#'+id+'_chosen > a > div > b');
    await button.click();
    let sel = '#'+id+'_chosen > div > ul > li:nth-child('+offset+')';
    let item = await page.waitForSelector(sel);
    await item.click();
}

async function fillBox( id, value ) {
    let box = await page.waitForSelector(id);
    await box.type( value, {delay: 50});
}

async function readTable( tblSel ) {
    tblSel = tblSel + " > tr";
    const row = await page.$$eval(tblSel, trs => trs.map(tr => {
        const tds = [...tr.getElementsByTagName('td')];
        return tds.map(td => td.textContent);
    }));
    return row;
}

function printTable( title,data ) {
    console.log(title);
    for ( let iy=0; iy < data.length; iy++ ) {
        let row = data[iy];
        for ( let ix=0; ix < row.length; ix++ ) {
            console.log(iy + ":" + ix + ": "+row[ix])
        }
    }
}


async function analyzePortfolio( portfolio, years, volatility, verbose ) {
    let optimURL = "https://www.portfoliovisualizer.com/optimize-portfolio";
    await page.goto( optimURL, {waitUntil: "networkidle2"});

    // Start year
    await pickDropdown("startYear",(years.start-1984));
    
    // End year
    await pickDropdown("endYear",(years.end-1984));

    // Goal
    await pickDropdown("goal",3);

    await fillBox("#targetAnnualVolatility",volatility.toString());

    let np = portfolio.length;
    let weight = 100/np;
    let allocPct = {};
    for ( let ip=0; ip < np; ip++ ) {
        var ticker = portfolio[ip];
        allocPct[ticker] = 0;
        await fillBox('#symbol'+(ip+1).toString(), ticker);
        //await fillBox('#allocation'+(ip+1).toString()+"_1", weight.toFixed(1));
    }
    await page.evaluate(() => {
        equalWeightAllocations (1,'');
        return false;
    });
    await page.click('#submitButton');

    let optimAllocSel = "#growthChart > div:nth-child(3) > div.col-sm-8 > table > tbody";
    let summarySel = "#growthChart > table:nth-child(5) > tbody";
    await page.waitForSelector(optimAllocSel);
    let allocTbl = await readTable(optimAllocSel);
    let summaryTbl = await readTable(summarySel);

    for ( let ialloc=0; ialloc < allocTbl.length; ialloc++ ) {
        allocPct[ allocTbl[ialloc][0] ] = allocTbl[ialloc][2];
    }


    let rslt = {
        allocPct: allocPct,
        CAGR :    summaryTbl[2][1],
        stdDev :  summaryTbl[4][1],
        bestYr :  summaryTbl[5][1],
        worstYr : summaryTbl[6][1],
        maxDD :   summaryTbl[7][1],
        sharpe :  summaryTbl[8][1],
        sortino : summaryTbl[10][1]
    };
    if (verbose) {
        console.log(rslt);
    } else {
        console.log("Finished "+portfolio);
    }
    return rslt;
}
module.exports = {
    initialize: initialize,
    login: login,
    analyzePortfolio: analyzePortfolio
};
