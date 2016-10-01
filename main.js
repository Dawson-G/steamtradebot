var steam = require("steam");
var steamUser = require("steam-user");
var SteamID = require('steamid');
var fs = require("fs");

var TradeOfferManager = require("steam-tradeoffer-manager");

var client = new steamUser();

var steamCommunity = require("steamcommunity");

var steamToTp = require("steam-totp");

var community = new steamCommunity(steamClient);
var steamClient = new steam.SteamClient();
var steamUser = new steam.SteamUser(steamClient);
var steamFriends = new steam.SteamFriends(steamClient);

var config = fs.readFileSync("config.json");
var configFormatted = JSON.parse(config);

var identiySecret = configFormatted.identitysecret;
var sharedSecret = configFormatted.sharedsecret;

var inTrade = false;

var csgoInv;
var steamInv;
var steamID64;
var steamID3;

var tempTradeURl = 'https://steamcommunity.com/tradeoffer/new/?partner=306671577&token=d1ATFOxl';

client.setOption("promptSteamGuardCode", false);

logIn();

fs.readFile('polldata.json', function (err, data) {
    if (err) {
        console.warn('Error reading polldata.json. If this is the first run, this is expected behavior: '+err);
    } else {
        console.log("Found previous trade offer poll data.  Importing it to keep things running smoothly.");
        manager.pollData = JSON.parse(data);
    }
});

var manager = new TradeOfferManager({
	"steam": steamUser,
	"community": community,
	"language": "en",
	"pollInterval": 1000,
	 "cancelTime": null
});

client.on("webSession", function(steamID, cookies){
	community.setCookies(cookies);
	manager.setCookies(cookies, function(err) {
        if(err) {
            console.log(err);
            process.exit(1); // Fatal error since we couldn't get our API key
            return;
        }
        console.log("Got API key: " + manager.apiKey);
    });
	steamToTp.steamID = steamID;
	community.startConfirmationChecker(2500, identiySecret);
});

client.on("loggedOn", function(details){
	client.setPersona(steam.EPersonaState.Online);
	client.gamesPlayed(730);
	
	console.log("Logged on to steam!");
	
	loadUserInventory(client.steamID.accountid, 753, 6, function(err, data){
	    if(err){
	        console.log("Error Loading Our Steam Inventory");
	    }else{
	        steamInv = data;
	    }
	});
	
	loadUserInventory(client.steamID.accountid, 730, 2, function(err, data){
	   if(err){
	       console.log("Error Loading Our CS:GO Inventory");
	   }else{
	       csgoInv = data;
	   }
	});
	
	loadUserInventory(306671577, 753, 6,  function(err, data){
	    if(err){
	       console.log("error loading user inventory"); 
	    }else{
            
            sendTradeOffer(tempTradeURl, [{"appid":753,"contextid":6,"assetid":"2623938436"}], [{"appid":753,"contextid":6,"assetid":"3341118391"}], "Hello", function(err, status){
                if(err){
                    console.log(status);
                }else{
                    console.log(status);
                }
            });
	    }
	});
});

client.on("steamGuard", function(domain, callback, lastCodeWrong){
	if(lastCodeWrong){
		console.log("Last code wrong. Try again");
    }
	callback(steamToTp.generateAuthCode(sharedSecret));
	
});

client.on('accountLimitations', function (limited, communityBanned, locked, canInviteFriends) {
    if (limited) {
        console.warn("Our account is limited. We cannot send friend invites, use the market, open group chat, or access the web API.");
    }
    if (communityBanned){
        console.warn("Our account is banned from Steam Community");
    }
    if (locked){
        console.error("Our account is locked. We cannot trade/gift/purchase items, play on VAC servers, or access Steam Community.  Shutting down.");
        process.exit(1);
    }
    if (!canInviteFriends){
        console.warn("Our account is unable to send friend requests.");
    }
});

community.on("confKeyNeeded", function(tag, callback){
	var time = Math.floor(Date.now()/1000);
	callback(null, time, steamToTp.getConfirmationKey(identiySecret, time, tag));
});

community.on("newConfirmations", function(conf){
	conf.respond(Math.floor(Date.now()/1000), steamToTp.getConfirmationKey(identiySecret, Math.floor(Date.now()/1000), "allow"), true, function(err){
		if(err){
			console.log("Confirmation Failed: " + err);
		}else{
			console.log("Trade Confirmation Successful.");
		}
	});
});

manager.on('newOffer', function (offer) {
    console.info("New offer #"+ offer.id +" from "+ offer.partner.getSteam3RenderedID());
 
    // Accept any trade offer from the bot administrator, or where we're getting free stuff.
    if (offer.itemsToGive.length === 0) {
        console.info("User "+ offer.partner.getSteam3RenderedID() +" offered a valid trade.  Trying to accept offer.");
        offer.accept(function (err) {
            if (err) {
                console.error("Unable to accept offer "+ offer.id +": " + err.message);
            } else {
                console.info("Offer accepted");
            }
        });
    } else { // Otherwise deny it and message the user
        console.info("User "+ offer.partner.getSteam3RenderedID() +" offered an invalid trade.  Declining offer.");
        offer.decline(function (err) {
            if (err) {
                console.error("Unable to decline offer "+ offer.id +": " + err.message);
            } else {
                console.debug("Offer declined");
            	
            }
        });
    }
});
 
manager.on('receivedOfferChanged', function (offer, oldState) {
    //console.log(offer.partner.getSteam3RenderedID() +" Offer #" + offer.id + " changed: " + TradeOfferManager.getStateName(oldState) + " -> " + TradeOfferManager.getStateName(offer.state));
 
    if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {
        offer.getReceivedItems(function (err, items) {
            if (err) {
                console.error("Couldn't get received items: " + err);
            } else {
                var names = items.map(function(item) {
                    return item.name;
                });
                console.log("Received: " + names.join(', '));
            }
        });
    }
});

// When one of our offers changes states
manager.on('sentOfferChanged', function (offer, oldState) {
    // Alert us when one of our offers is accepted
    if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {
        console.info("Our sent offer #"+ offer.id + " has been accepted.");
    }
});

client.on('error', function (e) {
    // Some error occurred during logon.  ENums found here: 
    // https://github.com/SteamRE/SteamKit/blob/SteamKit_1.6.3/Resources/SteamLanguage/eresult.steamd
    console.error(e);
    process.exit(1);
});

client.on('newItems', function (count) {
    console.info(count + " new items in our inventory");
});

// Steam is down or the API is having issues
manager.on('pollFailure', function (err) {
    console.error("Error polling for trade offers: "+err);
});
 
// When we receive new trade offer data, save it so we can use it after a crash/quit
manager.on('pollData', function (pollData) {
    fs.writeFile('polldata.json', JSON.stringify(pollData));
});

function logIn(){
    client.logOn({
        "accountName": configFormatted.username,
    	"password": configFormatted.password,
    	"machineName": "nodeJS-Bot"
    });   
}

/*

loadUserInventory(account#, appID, tabNumber, function(err, data){
    if(err){
        console.log("Error Loading Our Steam Inventory");
    }else{
        steamInv = data;
    }
});

*/

function loadUserInventory(user, appid, num, callback){
    
    var sid = new SteamID();
    sid.universe = SteamID.Universe.PUBLIC;
    sid.type = SteamID.Type.INDIVIDUAL;
    sid.instance = SteamID.Instance.DESKTOP;
    sid.accountid = user;
    
    var steam3id = sid.getSteam3RenderedID();
    
    manager.loadUserInventory(steam3id, appid, num, true, function(err, inventory, currency){
    if(err){
        callback(true, null);
    }else{
	   callback(false, inventory);
	   }
	});
}

/*

TradeURL = Person to send Trade Offer to
theirItems/myItems format = {"appid": #, "contextid": #, "assetid": "#"}
message = string format
callback = a way to check errors

sendTradeOffer(tempTradeURl, [{"appid":753,"contextid":6,"assetid":"2623938436"}], [{"appid":753,"contextid":6,"assetid":"3341118391"}], "Hello", function(err, status){
    if(err){
        console.log(status);
    }else{
        console.log(status);
    }
});

*/

function sendTradeOffer(tradeUrl, theirItems, myItems, message, callback){
    var offer = manager.createOffer(tradeUrl);
    
    if(theirItems != null){
        offer.addTheirItems(theirItems);
    }
    
    if(myItems != null){
        offer.addMyItems(myItems);
    }
    
    offer.setMessage(message);

    offer.send(function(err, status) {
        if (err) {
            callback(true, "Trade " + err);
        } else {
            callback(false, status);
        }
    });
}