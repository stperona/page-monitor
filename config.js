var config = {
	"alertEmail": "email@example.com",
	"monitors": [
		{"name": "example", "url": "http://example.com", "intervalDuration": 15000, "intervalId": null, "lastChecked": null, "ignoreIds": ["example"], "stripComments": false}
	],
	"smtpOpts": {
	    host: "smtp.gmail.com",
	    secureConnection: false,
	    port: 587,
	    auth: {
	        user: "USERNAME",
	        pass: "PASSWORD"
	    },
	    requiresAuth: true,
	    domains: ["gmail.com", "googlemail.com"]

	}
}

module.exports = config;