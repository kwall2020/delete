var https = require('https');
var querystring = require('querystring');

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------
var token = 'xoxp-3519851009-214638020262-334574904401-e423a804095aa3f89de96d07eac24fa2'; // api token
var userID = 'U6AJS0L7Q'; // your user id, for deleting all your own message
var dryRun  = false; // just calculate, doesn't actually delete anything

/**
 *  Available Types:
 *
 *  channels      - Public Channel
 *  groups        - Private Channel
 *  conversations - Direct Message
 *  conversations - Group Message
 *  files         - Files
 */
var channels = [
	{
	    channel: 'D78D49TUZ',
	    type: 'conversations'
    },
    {
        channel: 'GF6Q3FLA3',
        type: 'conversations'
    }
];

// --------------------------------------------------------------------------
// Global
// --------------------------------------------------------------------------
var delay      = 300;
var count      = 1000;
var baseApiUrl = 'https://slack.com/api';

var currentChannel = null;
var batch          = 0;
var itemsQueue     = [];
var totalItems     = 0;
var cursor         = '';

// --------------------------------------------------------------------------
// Run
// --------------------------------------------------------------------------
function historyUrl() {
    var endpoint = apiHistoryEndpoint();
    return `${baseApiUrl}/${endpoint}`;
}

function deleteUrl(item) {
    var endpoint = apiDeleteEndpoint(item);
    return `${baseApiUrl}/${endpoint}`;
}

function apiHistoryEndpoint() {
    if (currentChannel.type == 'files') {
        var query = querystring.stringify({token, count});

        return `files.list?${query}`;
    }

    var query = querystring.stringify({
        token,
        count,
        channel : currentChannel.channel,
        cursor
    });

    return `${currentChannel.type}.history?${query}`;
}

function apiDeleteEndpoint(item) {
    if (currentChannel.type == 'files') {
        var query = querystring.stringify({token, file: item.id});
        return `files.delete?${query}`;
    }

    var query = querystring.stringify({
        token,
        channel: currentChannel.channel,
        ts: item.ts
    });

    return `chat.delete?${query}`;
}

function pushItem(item) {
    if (userID && item.user != userID) {
        return;
    }

    if (currentChannel.type != 'files' && (item.subtype == 'group_join' || item.subtype == 'group_purpose')) {
        return;
    }

    itemsQueue.push(item);
}

function fetchItems() {
    https.get(historyUrl(), (res) => {
        var body = '';

        res.on('data', (chunk) => {
            body += chunk;
        });

        res.on('end', () => {
			var response = JSON.parse(body);

            var key = currentChannel.type == 'files'? 'files' : 'messages';

            for (var i = 0; i < response[key].length; i++) {
                pushItem(response[key][i]);
            }

            batch ++;

            if (currentChannel.type == 'files') {
                cursor = response.paging.pages > response.paging.page? response.paging.page + 1: cursor;

                if (response.paging.pages <= response.paging.page) {
                    cursor = '';
                }
            } else {
                cursor = response.has_more? response.response_metadata.next_cursor : cursor;

                if (! response.has_more) {
                    cursor = '';
                }
            }

            totalItems += itemsQueue.length;

            if (! dryRun) {
                console.log(`Running batch #${batch}`);
            }

            deleteItem();
        });
    }).on('error', function (e) {
        console.log("Got an error: ", e);
    });
}

function deleteItem() {
    if (itemsQueue.length == 0) {
        if (cursor) {
            if (! dryRun) {
                console.log(`Preparing for the next batch ${cursor}`);
            }
            setTimeout(fetchItems, delay);
        } else {
            if (dryRun) {
                var estimate = totalItems * delay;
                var seconds = ("00" + Math.floor(estimate / 1000) % 60).slice(-2);
                var minutes = ("00" + Math.floor(estimate / 60000)).slice(-2);
                console.log(`There will be total of ${batch} baches and ${totalItems} messages to delete. Estimate time is ${minutes}:${seconds} (timeout not included).`);
            } else {
                console.log(`Channel done! ${totalItems} messages have been deleted.`);
            }
            setTimeout(runChannels, delay);
        }
        return;
    }

    var item = itemsQueue.shift();

    if (dryRun) {
        itemsQueue = [];
        deleteItem();
        return;
    }

    https.get(deleteUrl(item), (res) => {
        var body = '';

        res.on('data', (chunk) => {
            body += chunk;
        });

        res.on('end', () => {
			var response = JSON.parse(body);
			console.log(response);
            var timeout = delay;

            if (response.ok === false) {
                var date = new Date();
                var currentTime = date.toTimeString();

                if (response.error == 'ratelimited') {
                    console.log(`Limit exceeded. Waiting for 30 seconds. ${currentTime}`);
                    itemsQueue.push(item);
                    timeout = 10000;
                }
            }

            setTimeout(deleteItem, timeout);
        });
    }).on('error', (e) => {
        console.log("Got an error: ", e);
    });
}

function runChannels() {
    if (channels.length == 0) {
        console.log(` `);
        console.log(`All channels are done.`);
        return;
    }

    currentChannel = channels.shift();
    console.log(` `);
    console.log(`fetching channel: ${currentChannel.channel} (type: ${currentChannel.type})...`);
    batch = 0;
    fetchItems();
}

runChannels();
