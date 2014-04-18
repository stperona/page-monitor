var config = require('./config');
var http = require('http');
var https = require('https');
var fs = require('fs');
var jsDiff = require('diff');
var escape = require('escape-html');
var nodeMailer = require('nodemailer');
var htmlParser = require("htmlparser2");
var domUtils = require("domutils");
var select = require('soupselect').select;

var smtpTransport = nodeMailer.createTransport("SMTP", config.smtpOpts);

// Setup folder for monitor page output.
try {
	fs.mkdirSync('monitor_output');
} catch (e) {
	if (e.code !== 'EEXIST') {
		throw e;
	}
}

http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World\n');
}).listen(3000, '127.0.0.1');

console.log('Server running at http://127.0.0.1:3000/');

// Start monitors.
for (var m in config.monitors) {
	(function (monitorId) {
		config.monitors[monitorId].intervalId = setInterval(function() {
											console.log('Checking monitor: ' + config.monitors[monitorId].name);
											getPage(config.monitors[monitorId]);
										}, config.monitors[monitorId].intervalDuration);
	})(m);

}


function getPage(monitor) {
	var data;
	var protocol = monitor.url.substr(0, 5);

	if (protocol === 'http:') {
		http.get(monitor.url, function(res) {
			res.on("data", function(chunk) {
				data += chunk;
			});
			res.on("end", function() {
				stripIgnoreAndSave(monitor, data)
			});
		});
	} else if (protocol === 'https') {
		https.get(monitor.url, function(res) {
			res.on("data", function(chunk) {
				data += chunk;
			});
			res.on("end", function() {
				stripIgnoreAndSave(monitor, data)
			});
		});
	} else {
		console.log("Unsupported protocol.");
		return 0;
	}
}

function stripIgnoreAndSave(monitor, data) {
	// Strip comments if enabled. 
	if(monitor.hasOwnProperty('stripComments') && monitor.stripComments) {
		data = data.replace(/<!--[\s\S]*?-->/g, "");
	}

	// Strip ignore chunks.
	if (monitor.hasOwnProperty('ignoreIds')) {
		var handler = new htmlParser.DomHandler(function (error, dom) {
		    if (error)
		        console.log(error);
		    else
		    	for (i in monitor.ignoreIds) {
			    	select(dom, '#' + monitor.ignoreIds[i]).forEach(function(element) {
			    		domUtils.removeElement(element);
			    	});
		    	}

		    	var strippedHTML = '';
		    	for (e in dom) {
		    		strippedHTML = strippedHTML + domUtils.getInnerHTML(dom[e]);
		    	}
		        
		        writePageToFS(monitor, strippedHTML);
		});
		var parser = new htmlParser.Parser(handler);
		parser.write(data);
		parser.done();
	} else {
		writePageToFS(monitor, data);
	}
}

function writePageToFS(monitor, data) {
	// Write file to file system.
	var newPageTimestamp = new Date().getTime();
	fs.writeFile("monitor_output/" + monitor.name + '-' + newPageTimestamp + '.html', data, function(err) {
	    if(err) {
	        console.log(err);
	    } else {
	    	// Compare the pages if we have an old copy to compare against.
	    	if (monitor.lastChecked) {
	        	comparePage(monitor, newPageTimestamp);
        	} else {
        		monitor.lastChecked = newPageTimestamp;
        	}
	    }
	});
}

function comparePage(monitor, newPageTimestamp) {
	// Get old page.
	var oldPage = fs.readFileSync("monitor_output/" + monitor.name + '-' + monitor.lastChecked + '.html', "utf8");

	// Get new page
	var newPage = fs.readFileSync("monitor_output/" + monitor.name + '-' + newPageTimestamp + '.html', "utf8");

	// Diff the two pages.
	var diff = jsDiff.diffChars(oldPage, newPage);

	// Store the diff results.
	var diffResults = '';
	diff.forEach(function(part){
		// green for additions, red for deletions
		// grey for common parts
		var color = part.added ? 'green' : part.removed ? 'red' : 'grey';
		diffResults = diffResults + '<span style="color:' + color + '">' + escape(part.value) + '</span>';
	});

	// Format diffResults with pre.
	diffResults = '<pre>' + diffResults + '</pre>';
	fs.writeFileSync("monitor_output/" + monitor.name + '-diff.html', diffResults);
	
	// Remove old file.
	fs.unlink("monitor_output/" + monitor.name + '-' + monitor.lastChecked + '.html', function (err) {
		if (err) throw err;
		console.log('successfully deleted monitor_output/' + monitor.name + '-' + monitor.lastChecked + '.html');
	});

	// Update last checked.
	monitor.lastChecked = newPageTimestamp;

	// If there are diffs send alert.
	if (diff.length > 1) {
		console.log("sending alert");
		sendAlert(monitor, diffResults);
	}
}

function sendAlert(monitor, diffData) {
	// setup e-mail data with unicode symbols
	var mailOptions = {
	    from: "Page Monitor <catchalltheads@gmail.com>", // sender address
	    to: config.alertEmail, // list of receivers
	    subject: "Page Monitor Change Alert (" + monitor.name + ")", // Subject line
	    html: diffData
	}

	// send mail with defined transport object
	smtpTransport.sendMail(mailOptions, function(error, response){
	    if(error){
	        console.log(error);
	    }else{
	        console.log("Message sent: " + response.message);
	    }

	    // if you don't want to use this transport object anymore, uncomment following line
	    //smtpTransport.close(); // shut down the connection pool, no more messages
	});
}