var async           = require("async"),
    SteamUser       = require("steam-user");

var database        = require("/shared-code/database.js");
    config          = require("/shared-code/config.js");

var n_accounts_to_create = 10;
var next_account_id = 0;

var master_client = null;
var master_credentials = {
    accountName: "wisdota_master_bot",
    password: "all-your-steam-bots-are-belong-to-us"
};

var create_interval = 1000;

function createBotData(id)
{
    var description = "_";
    switch(config.version)
    {
    case "LOCAL":
        description = "lbot";
        break;
    case "DEV":
        description = "devbot";
        break;
    case "PRODUCTION":
        description = "bot";
        break;
    default:
        console.log("wtf is this", config.version);
    }

    return {
        "name": "wisdota_"+description+"_"+id,
        "password": "crawley-the-"+description+"-"+id,
        "email": "wisdota-bot@tembryo.com"
    };
}

async.waterfall(
    [
        function(callback)
        {
            console.log("version: ", config.version, config.database_host);
            callback();
        },
        database.generateQueryFunction("SELECT COUNT(*) as n_steam_accs FROM SteamAccounts;",[]),
        function(results, callback)
        {
            if(results.rowCount < 1)
            {
                callback("bad db result", results)
                return;
            }

            var closed = false;
            var close_function = function (a,b)
            {
                if(!closed)
                {
                    closed = true;
                    callback(a,b);
                    return;
                }
                else
                {
                    console.log("closing a second time", a, b);
                    return;
                }
            }

            next_account_id = parseInt(results.rows[0]["n_steam_accs"])+1;   
            console.log("next_account_id", next_account_id);

            master_client = new SteamUser({
                promptSteamGuardCode: false
            });
 
            master_client.logOn(master_credentials);
            master_client.on('loggedOn', function(details) {
                console.log("logged on master");
                close_function(null, details);
            });
 
            master_client.on('error', function(err) {
                close_function("error", err);
            });
        },
        function(details, callback)
        {
            var n_created = 0;
            var bot_data = null;
            var failed = false;
            async.whilst(
                function(){
                    return n_created < n_accounts_to_create && !failed;
                },
                function(callback)
                {
                    async.waterfall(
                        [
                            function(callback)
                            {
                                bot_data = createBotData(next_account_id);
                                next_account_id++;   
                                console.log("attempting to create account");
                                master_client.createAccount(
                                    bot_data["name"],
                                    bot_data["password"],
                                    bot_data["email"],
                                    function(response)
                                    {
                                        callback(null, response);
                                    }
                                );
                            },
                            function(response, callback)
                            {

                                if(! (response === SteamUser.EResult.OK))
                                {
                                    console.log("creation of account failed", bot_data, response)
                                    failed = true;
                                    callback("failed creating account, response was", response);
                                    return;
                                }
                                console.log("created account",bot_data, response);
                                database.query("INSERT INTO SteamAccounts (name, password) VALUES ($1, $2);",
                                                [bot_data["name"], bot_data["password"]], callback)
                            },
                            function(results, callback)
                            {
                                if(results.rowCount != 1)
                                {
                                    failed = true;
                                    callback("failed saving account data");
                                    return;
                                }

                                n_created++;
                                setTimeout(
                                    function()
                                    {
                                        callback();
                                    },
                                    create_interval
                                );
                            }
                        ],
                        callback
                    );
                },
                callback
            );

        },
        function(callback)
        {
            console.log("should be done creating accs");
            callback();
        }
    ],
    function(err, result)
    {
        console.log("finished", err, result);
        master_client.on("disconnected",
            function(response)
            {
                console.log("logged out master client", response);
            });

        master_client.logOff();
    }
);