var pv = require("./modules/schwab");

(async () => {
    await pv.initialize(true);
    let ok = await pv.login();
    if (1) {
    if (ok) {
        let posFile = await pv.downloadPositions();
        console.log("HEY: posFile="+posFile);
    }
    pv.close();
    process.exit();
    }
})()
