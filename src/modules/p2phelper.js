/*
 * Copyright © 2018 EnTanMo Foundation
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Unless otherwise agreed in a custom licensing agreement with the EnTanMo Foundation,
 * no part of this software, including this file, may be copied, modified,
 * propagated, or distributed except according to the terms contained in the
 * LICENSE file.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

'use strict';

const Router = require('../utils/router');
const sandboxHelper = require('../utils/sandbox');
const ip = require('ip');
const request = require('request');
const net = require('net');
const extend = require('extend');
const async = require('async');

var modules, library, self, __private = {}, shared = {};

function P2PHelper(cb, scope) {
    library = scope;
    self = this;
    self.__private = __private;
    __private.attachApi();

    setImmediate(cb, null, self);
}

__private.attachApi = function () {
    var router = new Router();

    router.use(function (req, res, next) {
        if (modules) return next();

        res.status(500).send({success: false, error: "Blockchain is loading"});
    });

    /*
    router.map(shared, {
        "get /": "acquireIp"
    });
    */
    router.post("/", shared.acquireIp.bind(shared));

    router.use(function(req, res) {
        res.status(500).send({success: false, error: "API endpoint not found"});
    });

    library.network.app.use('/api/p2phelper', router);
    library.network.app.use(function (err, req, res, next) {
        if (!err) return next();
        library.logger.error(req.url, err.toString());
        res.status(500).send({success: false, error: err.toString()});
    });
}

P2PHelper.prototype.broadcast = function (cb) {
        
    modules.peer.getbootstrapNode( function (err, peers) {
        if (!err) {
           
            async.detectLimit(peers, 1, function (peer, cb) {
             
                var url = "/api/p2phelper";
                if (peer.address) {
                    url = "http://" + peer.address + url;
                } else {
                    url = "http://" +peer.host + ":" +(parseInt(peer.port) -1) + url;// ip.fromLong(peer.ip)
                }
              
                const req = {
                    url: url,
                    method: "POST",
                    json: true,
                    timeout: library.config.peers.options.timeout,
                    forever: true
                };
                //console.log("acquireIp request: ", url);
                request(req, function (err, resp, body) {
                    //console.log("acquireIp response : ", JSON.stringify(body));
                    if (err || resp.statusCode !== 200) {
                        return cb(null, false);
                    }
                   // console.log("acquireIp get: ", body.ip);
                    if (body.ip && typeof body.ip === "string" && !ip.isPrivate(body.ip)) {
                        const currentIp = library.config.publicIp;
                        const newIp = body.ip;
                        if (currentIp !== newIp) {
                            library.logger.log("acquireSelfIp: ", newIp);
                            library.config.publicIp = newIp;
                            setImmediate(() => {
                                library.bus.message("publicIpChanged", library.config.publicIp, library.config.peerPort, true);
                            });
                        }
                        return cb(null, true);
                    }

                    return cb(null, false);
                });
            }, function (err, result) {
                if (!result) {
                    // TODO -- DetachLimit failure, so after 1 second to repeat.
                    //console.log("acquireIp result : ", JSON.stringify(result));
                    setTimeout(() => {
                        self.broadcast();
                    }, 1 * 1000);
                }
            })
        }
    });
}

P2PHelper.prototype.onBind = function (scope) {
    modules = scope;
}

P2PHelper.prototype.onPeerReady = function () {
    // 未配置acquireip选项，则不启用自动获取公网ip的操作
   //console.log("acquireIp library.config.acquireip: ", library.config.acquireip);
    if (!library.config.acquireip) {
        return ;
    }
    setImmediate(function nextUpdatePublicIp() {
        self.broadcast();
        setTimeout(nextUpdatePublicIp, 65 * 1000);
    });


    setImmediate(function nextCheckPublicIp() {
        if (!library.config.publicIp) {
            self.broadcast();
            setTimeout(nextCheckPublicIp, 1 * 1000);
        } else {
            setTimeout(nextCheckPublicIp, 600 * 1000);
        }
    });
}

P2PHelper.prototype.sandboxApi = function (call, args, cb) {
    sandboxHelper.callMethod(shared, call, args, cb);
}

shared.acquireIp = function (req, res) {
    const remoteAddress = req.socket.remoteAddress;
    const remoteFamily = req.socket.remoteFamily;
    library.logger.info("acquireIp: ", remoteAddress, remoteFamily);
    const response = {
        ip: remoteAddress,
        family: remoteFamily
    };
    return res.json(extend({}, {"success": true}, response));
}

module.exports = P2PHelper;