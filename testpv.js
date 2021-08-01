const fs = require('fs');
const util = require('util');
const csv = require('csv-parser')
var pv = require("./modules/portfoliovisualizer");
const store = require('data-store');

// Args
var doPV = true;
var doPrint = false;

// Settings
const suiteIndex = 1;
const maxEachClass = 3;
const resultsFile = "results.data";
var verbose = false;

// Year ranges for which data can be collected.
const yearRanges = [
    {start: 2004, end: 2013},
    {start: 2005, end: 2015},
    {start: 2007, end: 2017},
    {start: 2009, end: 2019},
    {start: 2004, end: 2021}
];

// Target volatilities for which we can optimize.
const targetVols = [8.0, 10.0, 12.0];

function yearsDescr( years ) 
{
    return years.start + "-" + years.end;
}

function tickersDescr( tickers )
{
    return tickers.join();
}

function getResultKey( tickers, years, volatility )
{
    return yearsDescr(years) + ":" + volatility + ":" + tickersDescr(tickers);
}

const classGroups = [
    // All
    {
	"Large cap"			: true,
	"Small cap"			: true,
	"Mid cap"			: true,
	"International"		: true,
	"Real Estate"		: true,
	"Bonds"				: true,
	"Financial"			: true,
	"Technology"		: true,
	"Healthcare"		: true,
	"Natural resources"	: true
    },
    // LC, SC, Bond, Gold, RE
    {
	"Large cap"			: true,
	"Small cap"			: true,
	"Mid cap"			: false,
	"International"		: false,
	"Real Estate"		: true,
	"Bonds"				: true,
	"Financial"			: false,
	"Technology"		: false,
	"Healthcare"		: false,
	"Natural resources"	: true
    },
    // +fin
    {
	"Large cap"			: true,
	"Small cap"			: true,
	"Mid cap"			: false,
	"International"		: false,
	"Real Estate"		: true,
	"Bonds"				: true,
	"Financial"			: true,
	"Technology"		: false,
	"Healthcare"		: false,
	"Natural resources"	: true
    },
    // +tech
    {
	"Large cap"			: true,
	"Small cap"			: true,
	"Mid cap"			: false,
	"International"		: false,
	"Real Estate"		: true,
	"Bonds"				: true,
	"Financial"			: false,
	"Technology"		: true,
	"Healthcare"		: false,
	"Natural resources"	: true
    },
    // +HC
    {
	"Large cap"			: true,
	"Small cap"			: true,
	"Mid cap"			: false,
	"International"		: false,
	"Real Estate"		: true,
	"Bonds"				: true,
	"Financial"			: false,
	"Technology"		: false,
	"Healthcare"		: true,
	"Natural resources"	: true
    },
    // +Int
    {
	"Large cap"			: true,
	"Small cap"			: true,
	"Mid cap"			: false,
	"International"		: true,
	"Real Estate"		: true,
	"Bonds"				: true,
	"Financial"			: false,
	"Technology"		: false,
	"Healthcare"		: false,
	"Natural resources"	: true
    },
    // +MC
    {
	"Large cap"			: true,
	"Small cap"			: true,
	"Mid cap"			: true,
	"International"		: false,
	"Real Estate"		: true,
	"Bonds"				: true,
	"Financial"			: false,
	"Technology"		: false,
	"Healthcare"		: false,
	"Natural resources"	: true
    },
    // LC, Bond, Gold
    {
	"Large cap"			: true,
	"Small cap"			: false,
	"Mid cap"			: false,
	"International"		: false,
	"Real Estate"		: false,
	"Bonds"				: true,
	"Financial"			: false,
	"Technology"		: false,
	"Healthcare"		: false,
	"Natural resources"	: true
    }
];


var assetData = {
    classes: [],
    tickers: []
};

// Settable controls.
var onlyClassGroup = -1;    // Index of single classGroups groups.  -1 means all.  Override with -cg
var onlyYearRange = -1;     // Index of single yearRanges entry.  -1 means all.  Override with -yr
var onlyVolatility = undefined; // Explicit volatility.  Set with -vol
var maxPortfolios = Number.MAX_VALUE; // Max porfolios to actually analyze.  Set with -max
var perInterval = 1;        // Default number of scrapes per interval. Override with -per
var pauseSec = 10;       // Default number of seconds per interval. Override with -pause
var printInput = false;  // If true, prints input sets, but doesn't analyze. Set with -print_in
var headless = false;   // True to run headless.  Set with -headless.
var maxPriority = 1;    // Default max priority. Change with -pri.

function readArgs() 
{
    // set defaults.
    doPV = true;
    doPrint = false;

    for ( let i=2; i < process.argv.length; i++ ) {
        let arg = process.argv[i];
        if (arg == "-print") {
            doPrint = true;
            doPV = false;
        } else if (arg == "-print_in") {
            doPrint = false;
            doPV = false;
            printInput = true;
        } else if (arg == "-pv") {
            doPrint = false;
            doPV = true;
        } else if (arg == "-cg") {
            onlyClassGroup = Number(process.argv[i+1]);
            i++;
        } else if (arg == "-yr") {
            onlyYearRange = Number(process.argv[i+1]);
            i++;
        } else if (arg == "-max") {
            maxPortfolios = Number(process.argv[i+1]);
            i++;
        } else if (arg == "-per") {
            perInterval = Number(process.argv[i+1]);
            i++;
        } else if (arg == "-pause") {
            pauseSec = Number(process.argv[i+1]);
            i++;
        } else if (arg == "-vol") {
            onlyVolatity = Number(process.argv[i+1]);
            i++;
        } else if (arg == "-pri") {
            maxPriority = Number(process.argv[i+1]);
            i++;
        } else if (arg == "-verbose") {
            verbose = true;
        } else if (arg == "-headless") {
            headless = true;
        } else {
            console.log("ERROR: Unrecognized arg \'"+arg+"\'");
            process.exit(1);
        }
            
    }
}

function pause(delay_sec) {
    return new Promise(function (resolve, reject) {
        setTimeout(resolve, delay_sec*1000);
    });
}

// Returns an async generator with rows from the CSV file at the given path.
async function readCSV(csvPath,data) {
  let rslt = [];
  const strm = fs.createReadStream(csvPath).pipe(csv());
  for await (const chunk of strm) {
	let ticker = chunk["Ticker"];
	let aclass = chunk["Class"];
	let year = chunk["Start Year"];
	let fees = chunk["Fees"];
	let pri = chunk["Pri"];
	if (data.classes[aclass] == undefined) {
		data.classes[aclass] = [ticker];
	} else {
		data.classes[aclass].push(ticker);
	}
    data.tickers[ticker] = {
        firstYear: year,
        fees: fees,
        pri: pri
    };
  }
}



// Return a copy of the tickers array with
//  - no more than maxEachClass tickers.
//  - no ticker with a start date before firstYear
//  - no ticker with a priority larger than maxPriority
function filterTickers( tickers, assetData, years )
{
    var rslt = [];
    for ( let i=0; (i < tickers.length) && (rslt.length < maxEachClass); i++ ) {
        let ticker = tickers[i];
        if ((years == undefined) || (assetData.tickers[ticker].firstYear <= years.start)) {
            if (assetData.tickers[ticker].pri <= maxPriority) {
                rslt.push(ticker);
            }
        }
    }
    return rslt;
}

// Returns true if all the tickers in the given array have data for the given date.
function tickersHaveData( tickers, assetData, years )
{
    for ( let i=0; i < tickers.length; i++ ) {
        let ticker = tickers[i];
        if (assetData.tickers[ticker].firstYear > years.start) {
//console.log("HEY: reject "+JSON.stringify(tickers)+" because "+ticker+" starts in "+assetData.tickers[ticker].firstYear +" and need "+years.start);
            return false;
        }
    }
    return true;
}

// Generator returning sets of tickers, covering all 
// combinations of the tickers for the given keys.  
// Includes no more than maxEachClass for each class.
async function* collectSets( keys, assetData, years, ikey )
{
	let values = filterTickers( assetData.classes[keys[ikey]], assetData, years );
	let nvals = values.length;

	if (ikey < (keys.length-1)) {
		// Collect a stream of sets from the next key.
		for await (const set of collectSets( keys, assetData, years, ikey+1 )) {
            if (nvals > 0) {
                for (let ival = 0; ival < nvals; ival++ ) {
                    let val = values[ival];
                    var outSet = set;
                    if (ival < (nvals-1)) {
                        // Duplicate the set, except for the last one, which we will use directly.
                        let dupSet = [];
                        for ( let idup=0; idup < set.length; idup++) {
                            dupSet.push(set[idup]);
                        }
                        outSet = dupSet;
                    }

                    // Add this value and produce a new set.
                    outSet.push( val );
                    yield outSet;
                }
            } else {
                yield set;
            }
		}
	} else {
		// Starting, just produce nvals sets.
		for (let ival = 0; ival < nvals; ival++ ) {
			yield [values[ival]];
		}
	}
}

function openStore()
{
    return store( { path: process.cwd() + '/' + resultsFile } );
}

var pvConnected = false;

async function connectPV()
{
    if (pvConnected) {
        return true;
    }
    await pv.initialize(headless);
    let ok = await pv.login();
	if (!ok) {
		console.log("Login failed");
		return false;
	} else {
        pvConnected = true;
        return true;
    }
}

async function  analyzePortfolios()
{

	// Read data.  Outer index is asset class, each containing an array of tickers.
    await readCSV("etfs.csv",assetData);

    // Local store for results.
    let result_store = openStore();

    let nDone = 0;
	let ip=0;
    let quit = false;

    for ( let icg=0; icg < classGroups.length; icg++ ) {

        let classGroup = classGroups[icg];
        if ((onlyClassGroup >= 0) && (onlyClassGroup != icg)) {
            continue;
        }

        var classes = [];
        for (var key in assetData.classes) {
            if ( classGroup[key] ) {
                classes.push(key);
            }
        }
        for await (const tickers of collectSets( classes, assetData, undefined, 0 )) {
//console.log("HEY: Got tickers "+tickersDescr(tickers));
            for ( let iyr=0; iyr < yearRanges.length; iyr++ ) {

                if ((onlyYearRange >= 0) && (onlyYearRange != iyr)) {
            //console.log("HEY: reject iyr="+iyr);
                    continue;
                }
                let years = yearRanges[iyr];
//console.log("HEY: Doing years "+yearsDescr(years)+"="+iyr);
                if (!tickersHaveData( tickers, assetData, years )) {
                    continue;
                }

                var vols = [];
                if (onlyVolatility) {
                    vols.push(onlyVolatility);
                } else {
                    vols = targetVols;
                }
                for ( let ivol=0; ivol < vols.length; ivol++ ) {
                    let volatility = vols[ivol];

                    if (printInput) {
                        console.log( "Years: "+ yearsDescr(years) + " Vol: "+ volatility + " Tickers: "+ tickersDescr(tickers) );
                    }
                    if (doPV) {
                        // Login if we haven't.
                        if (!await connectPV()) {
                            quit = true;
                            break;
                        }
                        let resultKey = getResultKey( tickers, years, volatility );

                        // Skip if we already have results for these tickers.
                        if (result_store.has( resultKey )) {
                            continue;
                        }

                        // Rate limit.
                        if ((nDone > 0) && ((nDone % perInterval) == 0)) {
                            console.log("Pause for "+pauseSec+" at end of batch of "+perInterval);
                            await pause(pauseSec);
                        }

                        // Do the analysis on PV.
                        let metrics = await pv.analyzePortfolio(tickers, years, volatility, verbose);

                        result_store.set( resultKey, metrics );
                        
                        nDone++;
                    }
                    ip++;
                    if (ip >= maxPortfolios) {
                        return;
                    }
                }
                if (quit) {break;}
            }
            if (quit) {break;}
        }
        if (quit) {break;}
    }
}

function printData()
{    
    let result_store = openStore();
    let keys = Object.keys(result_store.data);
    for ( let ip=0; ip < keys.length; ip++ ) {
        let key = keys[ip];
        let keySegs = key.split(":");
        let yearsArray = keySegs[0].split("-");
        let vol = keySegs[1];
        let portfolio = keySegs[2].split(",");
        let years = {start: yearsArray[0], end: yearsArray[1]};
        let metrics = result_store.get(key);
        console.log("Portfolio: "+tickersDescr(portfolio)+" Years: "+yearsDescr(years)+" Volatility "+vol+"%");
        let names = Object.keys(metrics);
        for ( let im=0; im < names.length; im++ ) {
            if (names[im] == "allocPct") {
                console.log("\tAllocation");
                let allocPct = metrics["allocPct"];
                let tickers = Object.keys(allocPct);
                for ( let ia=0; ia < tickers.length; ia++ ) {
                    let pct = allocPct[tickers[ia]];
                    if (pct != "0") {
                        console.log("\t\t"+tickers[ia]+": "+pct);
                    }
                }
                
            } else {
                console.log("\t"+names[im]+" "+metrics[names[im]]);
            }
        }
    }
}

(async () => {
    readArgs();

    if (doPrint) {
        printData();
    } else {
        await analyzePortfolios();
    }
    process.exit(0);
})();
