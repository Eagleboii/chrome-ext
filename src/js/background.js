chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
    if (request == "config") {
        loadConfig(function() {
            sendResponse(config)
        })
    } else if (request == "token") {
        getFreshToken(function() {
            sendResponse(jwt)
        })
    } else if (request == "login") {
        login(function(response) {
            if (response == "OK") sendResponse(jwt)
        })
    } else if (request == "logout") {
        logout();
        sendResponse(jwt)
    } else if (request == "print_v1_users_me") {
        printV1UsersMe(function(data) {
            sendResponse(data)
        })
    } else if (request == "auth_v1_session_token") {
        authV1SessionToken(function(response) {
            sendResponse(response)
        })
    }
});

"use strict";
var configPath = "./data/environment.json";
var config = {
    api_url: "",
    account_url: "",
    client_id: "",
    portal_url: "",
    print_service_url: ""
};
var jwt = {};
var jobId;
const max_refresh_retries = 3;
const printJobDetail = {
    jobId: "",
    fileName: "",
    printerName: "None",
    printJobTimeStamp: (new Date).toDateString(),
    printJobTimeValue: (new Date).getTime(),
    printJobStatusDescription: "",
    printJobStatus: 999,
    in_progress: true
};
var activePrinterListArray = [];
loadConfig();
$.ajaxPrefilter(function(options, originalOptions, jqXHR) {
    originalOptions._retry = isNaN(originalOptions._retry) ? max_refresh_retries : originalOptions._retry - 1;
    if (originalOptions.noAuth == null || !originalOptions.noAuth) {
        jqXHR.setRequestHeader("Authorization", "Bearer " + jwt.access_token)
    }
    if (originalOptions.error) originalOptions._error = originalOptions.error;
    options.error = $.noop();
    var dfd = $.Deferred();
    jqXHR.done(dfd.resolve);
    jqXHR.fail(function() {
        var args = Array.prototype.slice.call(arguments);
        if (jqXHR.status === 401 && originalOptions._retry > 0) {
            refreshToken(function() {
                $.ajax(originalOptions).then(dfd.resolve, dfd.reject)
            })
        } else {
            show_notlogged_message();
            if (originalOptions._error) dfd.fail(originalOptions._error);
            dfd.rejectWith(jqXHR, args)
        }
    });
    return dfd.promise(jqXHR)
});

function show_notlogged_message() {
    chrome.notifications.create("", {
        type: "basic",
        title: chrome.i18n.getMessage("notification_title_general_error"),
        message: chrome.i18n.getMessage("notification_message_error_login"),
        iconUrl: "../images/icons/ezeep-icon-24@2x.png"
    })
}

function printV1UsersMe(callback) {
    $.ajax({
        url: config.print_service_url + "v1/users/me/",
        type: "GET",
        statusCode: {
            200: function(data) {
                callback(data)
            }
        }
    })
}

function authV1SessionToken(callback) {
    $.ajax({
        url: config.account_url + "v1/session_tokens/",
        type: "POST",
        complete: function(e, xhr, settings) {
            callback(e)
        }
    })
}
chrome.printerProvider.onGetPrintersRequested.addListener(function(resultCallback) {
    if (!jwt.access_token) {
        show_notlogged_message();
        resultCallback([])
    }
    getFreshToken(function() {
        getPrinterList(resultCallback)
    })
});
chrome.printerProvider.onGetCapabilityRequested.addListener(function(printerId, resultCallback) {
    getFreshToken(function() {
        getPrinterProperties(printerId, function(properties) {
            chrome.extension.getBackgroundPage().console.log(properties);
            resultCallback(properties)
        })
    })
});
chrome.printerProvider.onPrintRequested.addListener(function(printJob, resultCallback) {
    getFreshToken(function() {
        var fdata = new FormData;
        var blob = new Blob;
        var azfileid = "";
        var azsasuri = "";
        blob = printJob.document;
        let currentjPrintJobDetail = sendDisplayJobMessage(printJob);
        fdata.append("uploadFile", blob, "document.pdf");
        if (jwt.access_token != "" && jwt.access_token != undefined) {
            PrepareUpload(function(code) {
                chrome.notifications.create("upload", {
                    type: "basic",
                    title: chrome.i18n.getMessage("notification_title_general_error"),
                    message: chrome.i18n.getMessage("notification_message_general_error"),
                    iconUrl: "../images/icons/ezeep-icon-24@2x.png"
                });
                currentjPrintJobDetail.in_progress = false;
                resetToDefaultIcon();
                savePrintJob(currentjPrintJobDetail)
            }, function(data) {
                azfileid = data.fileid;
                azsasuri = data.sasUri;
                chrome.extension.getBackgroundPage().console.log(azfileid);
                chrome.extension.getBackgroundPage().console.log(azsasuri);
                uploadDocument(fdata, azsasuri, function() {
                    printDocument(azfileid, printJob, currentjPrintJobDetail, function() {
                        chrome.extension.getBackgroundPage().console.log("Print request send");
                        chrome.notifications.create("notification_message_job_sent", {
                            type: "basic",
                            title: chrome.i18n.getMessage("notification_title_job_sent"),
                            message: chrome.i18n.getMessage("notification_message_job_sent"),
                            iconUrl: "../images/icons/ezeep-icon-24@2x.png"
                        })
                    })
                }, function() {
                    currentjPrintJobDetail.in_progress = false;
                    resetToDefaultIcon();
                    savePrintJob(currentjPrintJobDetail)
                })
            })
        }
        resultCallback("OK")
    })
});

function sendDisplayJobMessage(printJob) {
    let result = Object.assign({}, printJobDetail);
    result.fileName = printJob.title;
    result.in_progress = true;
    result.printJobTimeValue = (new Date).getTime();
    result.printJobTimeStamp = (new Date).toDateString();
    result.printJobStatusDescription = "Uploading the document";
    changeIcon();
    savePrintJob(result);
    return result
}

function getPrinterProperties(printerId, callBack) {
    var default_properties = {
        version: "1.0",
        printer: {
            copies: {
                default: 1
            },
            color: {
                option: [{
                    type: "STANDARD_MONOCHROME"
                }]
            },
            collate: {
                default: true
            },
            media_size: {
                option: [{
                    name: "NA_LETTER",
                    width_microns: 215900,
                    height_microns: 279400,
                    is_default: true
                }, {
                    name: "ISO_A4",
                    width_microns: 21e4,
                    height_microns: 297e3,
                    is_default: false
                }]
            },
            supported_content_type: [{
                content_type: "application/pdf",
                min_version: "1.5"
            }, {
                content_type: "text/plain"
            }]
        }
    };
    $.ajax({
        url: config.api_url + "sfapi/GetPrinterProperties/?id=" + printerId,
        type: "GET",
        statusCode: {
            500: function() {
                var message_setup = {
                    type: "basic",
                    title: chrome.i18n.getMessage("notification_title_general_error"),
                    message: chrome.i18n.getMessage("notification_message_general_error"),
                    iconUrl: "../images/icons/ezeep-icon-24@2x.png"
                };
                chrome.notifications.create(text, message_setup)
            },
            200: function(data) {
                chrome.extension.getBackgroundPage().console.log(data, data.length);
                console.log(data, data.length);
                if (data.length > 0) {
                    printJobDetail.printerName = data[0].Name;
                    var properties = setPrinterProperties(data);
                    callBack(properties)
                } else {
                    var message_setup = {
                        type: "basic",
                        title: chrome.i18n.getMessage("notification_title_no_printer_properties_found"),
                        message: chrome.i18n.getMessage("notification_message_no_printer_properties_found"),
                        iconUrl: "../images/icons/ezeep-icon-24@2x.png"
                    };
                    chrome.notifications.create("notification_message_no_printers_found", message_setup);
                    callBack(default_properties)
                }
            }
        }
    })
}

function setPrinterProperties(ezeepPrinterProperties) {
    var properties = {
        version: "1.0",
        printer: {
            copies: {
                default: 1
            },
            collate: {
                default: ezeepPrinterProperties[0].Collate
            },
            duplex: {
                option: [{
                    type: "NO_DUPLEX",
                    is_default: true
                }]
            },
            color: {
                option: [{
                    type: "STANDARD_MONOCHROME"
                }]
            },
            media_size: {
                option: []
            },
            supported_content_type: [{
                content_type: "application/pdf",
                min_version: "1.5"
            }, {
                content_type: "text/plain"
            }]
        }
    };
    if (ezeepPrinterProperties[0].Color) {
        properties.printer.color.option.push({
            type: "STANDARD_COLOR",
            is_default: true
        })
    }
    if (ezeepPrinterProperties[0].OrientationsSupported) {
        properties.printer.page_orientation = {
            option: []
        };
        if (ezeepPrinterProperties[0].OrientationsSupported.includes("portrait")) {
            properties.printer.page_orientation.option.push({
                type: "PORTRAIT"
            })
        }
        if (ezeepPrinterProperties[0].OrientationsSupported.includes("landscape")) {
            properties.printer.page_orientation.option.push({
                type: "LANDSCAPE"
            })
        }
    }
    if (ezeepPrinterProperties[0].DuplexSupported) {
        if (ezeepPrinterProperties[0].DuplexMode == 2) {
            properties.printer.duplex.option.push({
                type: "LONG_EDGE",
                is_default: true
            });
            properties.printer.duplex.option.push({
                type: "SHORT_EDGE"
            })
        }
        if (ezeepPrinterProperties[0].DuplexMode == 3) {
            properties.printer.duplex.option.push({
                type: "LONG_EDGE"
            });
            properties.printer.duplex.option.push({
                type: "SHORT_EDGE",
                is_default: true
            })
        } else {
            properties.printer.duplex.option.push({
                type: "LONG_EDGE"
            });
            properties.printer.duplex.option.push({
                type: "SHORT_EDGE"
            })
        }
    }
    console.log("language: " + chrome.i18n.getUILanguage());
    if (ezeepPrinterProperties[0].PaperFormats.length > 0) {
        let has_default = false;
        ezeepPrinterProperties[0].PaperFormats.forEach(function(format) {
            if (format.Id == 256) return;
            let is_default = false;
            if (ezeepPrinterProperties[0].hasOwnProperty("PaperFormatsIdDefault") ? ezeepPrinterProperties[0].PaperFormatsIdDefault == format.Id : chrome.i18n.getUILanguage() == "en-US" ? format.Name == "Letter" || format.Name == 'Letter (8.5 x 11")' : format.Name == "A4" || format.Name == "A4 (210 x 297mm)") {
                is_default = !has_default;
                has_default = true
            }
            properties.printer.media_size.option.push({
                name: "CUSTOM",
                custom_display_name: format.Name,
                width_microns: format.XRes * 100,
                height_microns: format.YRes * 100,
                vendor_id: format.Id,
                is_default: is_default
            })
        })
    }
    return properties
}

function uploadDocument(fdata, azsasuri, onSuccess, onFail) {
    $.ajax({
        url: azsasuri,
        type: "PUT",
        processData: false,
        noAuth: true,
        headers: {
            "x-ms-blob-type": "BlockBlob"
        },
        data: fdata,
        statusCode: {
            201: function() {
                return
            },
            401: function() {
                onFail()
            },
            500: function() {
                onFail()
            }
        }
    }).done(function() {
        onSuccess();
        chrome.extension.getBackgroundPage().console.log("Document uploaded")
    })
}

function printDocument(azfileid, printJob, currentjPrintJobDetail, success) {
    currentjPrintJobDetail.printJobStatusDescription = "Starting printing...";
    currentjPrintJobDetail.in_progress = true;
    changeIcon();
    savePrintJob(currentjPrintJobDetail);
    var orientationValue = 0;
    if (printJob.ticket.print.page_orientation !== undefined) {
        orientationValue = printJob.ticket.print.page_orientation.type == "PORTRAIT" ? 1 : 2
    }
    $.ajax({
        url: config.api_url + "sfapi/Print/",
        type: "POST",
        datatype: "json",
        contentType: "application/json",
        data: JSON.stringify({
            fileid: azfileid,
            type: "pdf",
            printerid: printJob.printerId,
            alias: currentjPrintJobDetail.fileName,
            properties: {
                color: printJob.ticket.print.color && printJob.ticket.print.color.type == "STANDARD_MONOCHROME" ? false : true,
                copies: printJob.ticket.print.copies ? printJob.ticket.print.copies.copies : 1,
                duplex: printJob.ticket.print.duplex && printJob.ticket.print.duplex.type == "NO_DUPLEX" ? false : true,
                duplexmode: printJob.ticket.print.duplex && printJob.ticket.print.duplex.type == "LONG_EDGE" ? 2 : printJob.ticket.print.duplex && printJob.ticket.print.duplex.type == "SHORT_EDGE" ? 3 : undefined,
                orientation: orientationValue,
                paperid: printJob.ticket.print.media_size.vendor_id
            }
        }),
        statusCode: {
            200: function(data) {
                printJobStatus(data.jobid, currentjPrintJobDetail)
            },
            400: function(data) {
                currentjPrintJobDetail.in_progress = false;
                resetToDefaultIcon();
                savePrintJob(currentjPrintJobDetail);
                resetToDefaultIcon();
                generate_notification(chrome.i18n.getMessage("notification_title_error_general"), chrome.i18n.getMessage("notification_message_error_login"));
                logout()
            }
        }
    }).done(function() {
        success()
    })
}

function PrepareUpload(onFail, onSuccess) {
    $.ajax({
        url: config.api_url + "sfapi/PrepareUpload/",
        type: "GET",
        statusCode: {
            401: function() {
                onFail(401)
            },
            500: function() {
                onFail(500)
            },
            200: function(data) {
                onSuccess(data)
            }
        }
    })
}

function printJobStatus(jobid, currentjPrintJobDetail) {
    $.ajax({
        url: config.api_url + "sfapi/Status/?id=" + encodeURIComponent(jobid),
        type: "GET",
        statusCode: {
            401: function() {
                resetToDefaultIcon();
                chrome.notifications.create("401-jobstatus", {
                    type: "basic",
                    title: chrome.i18n.getMessage("notification_title_general_error"),
                    message: chrome.i18n.getMessage("notification_message_general_error"),
                    iconUrl: "../images/icons/ezeep-icon-24@2x.png"
                })
            },
            500: function() {
                resetToDefaultIcon();
                chrome.notifications.create("500-jobstatus", {
                    type: "basic",
                    title: chrome.i18n.getMessage("notification_title_general_error"),
                    message: chrome.i18n.getMessage("notification_message_general_error"),
                    iconUrl: "../images/icons/ezeep-icon-24@2x.png"
                })
            },
            200: function(data) {
                currentjPrintJobDetail.jobId = jobid;
                currentjPrintJobDetail.printJobStatus = data.jobstatus;
                if (data.jobstatus == 129) {
                    var statusPrinting = ({
                        currentPage,
                        totalPage
                    }) => `Printing ${currentPage} of ${totalPage}.`;
                    currentjPrintJobDetail.printJobStatusDescription = [{
                        currentPage: data.jobpagesprinted,
                        totalPage: data.jobpagestotal
                    }].map(statusPrinting).join("");
                    savePrintJob(currentjPrintJobDetail);
                    printJobStatus(jobid, currentjPrintJobDetail);
                    return
                } else if (data.jobstatus == 1246) {
                    currentjPrintJobDetail.printJobStatusDescription = "Requesting Printjob Info";
                    savePrintJob(currentjPrintJobDetail);
                    printJobStatus(jobid, currentjPrintJobDetail);
                    return
                } else if (data.jobstatus == 0) {
                    currentjPrintJobDetail.printJobStatusDescription = "INFO: print job successfully finished"
                } else if (data.jobstatus == 3001) {
                    currentjPrintJobDetail.printJobStatusDescription = "ERROR: something went wrong - restart print job"
                } else if (data.code == 87) {
                    currentjPrintJobDetail.printJobStatusDescription = "ERROR: invalid job id"
                } else {
                    currentjPrintJobDetail.printJobStatusDescription = "ERROR: invalid print job identifier"
                }
                currentjPrintJobDetail.in_progress = false;
                resetToDefaultIcon();
                savePrintJob(currentjPrintJobDetail)
            }
        }
    })
}

function savePrintJob(currentPrintJob) {
    chrome.storage.local.get({
        activeJobDetails: []
    }, items => {
        let activeJobsArray = items.activeJobDetails;
        let new_printJob = true;
        let has_info_update = false;
        activeJobsArray = activeJobsArray.map(x => {
            if (x.fileName == currentPrintJob.fileName && x.printJobTimeValue && x.printJobTimeValue === currentPrintJob.printJobTimeValue) {
                new_printJob = false;
                if (x.printJobStatus !== currentPrintJob.printJobStatus || x.printJobStatusDescription !== currentPrintJob.printJobStatusDescription) has_info_update = true;
                return Object.assign({}, currentPrintJob)
            } else {
                return x
            }
        });
        if (new_printJob) {
            if (activeJobsArray.length >= 5) {
                activeJobsArray.shift()
            }
            activeJobsArray = [currentPrintJob].concat(activeJobsArray)
        }
        activeJobsArray.sort((x, y) => {
            if (x.printJobTimeValue > y.printJobTimeValue) return 1;
            if (x.printJobTimeValue < y.printJobTimeValue) return -1;
            return 0
        });
        chrome.storage.local.set({
            activeJobDetails: activeJobsArray
        }, function() {
            chrome.runtime.sendMessage({
                msg: "savePrintJob",
                printJobs: activeJobsArray,
                currentPrintJob: currentPrintJob,
                has_info_update: has_info_update,
                new_printJob: new_printJob
            })
        })
    })
}

function logout() {
    jwt = {};
    saveToken(jwt);
    try {
        chrome.identity.removeCachedAuthToken()
    } catch (e) {
        console.log(e)
    }
    try {
        chrome.identity.logout()
    } catch (e) {
        console.log(e)
    }
    setTimeout(function() {
        generate_notification(chrome.i18n.getMessage("notification_title_loggedout"), chrome.i18n.getMessage("notification_message_loggedout"));
        location.reload(true)
    }, 2e3)
}

function getFreshToken(onSuccess) {
    chrome.storage.sync.get(["access_token", "expiration_date", "refresh_token"], function(data) {
        if (data && data.access_token && jwt.access_token != "") {
            jwt = data;
            var timeNow = (new Date).getTime();
            chrome.extension.getBackgroundPage().console.log({
                timenow: timeNow,
                expiration_date: jwt.expiration_date
            });
            if (timeNow >= jwt.expiration_date) {
                refreshToken(function() {
                    onSuccess()
                })
            } else {
                onSuccess()
            }
        } else {
            jwt = {};
            saveToken(jwt);
            onSuccess()
        }
    })
}

function refreshToken(callback) {
    chrome.extension.getBackgroundPage().console.log("refresh token");
    $.ajax({
        url: config.account_url + "oauth/access_token/",
        type: "POST",
        async: false,
        refreshRequest: true,
        data: {
            grant_type: "refresh_token",
            refresh_token: jwt.refresh_token
        },
        statusCode: {
            200: function(data) {
                data.expiration_date = getExpirationDate(data);
                jwt = data;
                saveToken(jwt)
            },
            400: function(data) {
                generate_notification(chrome.i18n.getMessage("notification_title_error_general"), chrome.i18n.getMessage("notification_message_error_login"));
                logout()
            }
        },
        beforeSend: function(xhr) {
            xhr.setRequestHeader("Authorization", "Basic " + btoa(config.client_id + ":"))
        }
    }).done(callback)
}

function login(callback) {
    var redirect_url = chrome.identity.getRedirectURL("oauth2");
    var auth_url = config.account_url + "oauth/authorize/" + "?client_id=" + config.client_id + "&redirect_uri=" + redirect_url + "&response_type=code&prompt=select_account";
    chrome.extension.getBackgroundPage().console.log(redirect_url, auth_url);
    chrome.identity.launchWebAuthFlow({
        url: auth_url,
        interactive: true
    }, function(responseUrl) {
        chrome.extension.getBackgroundPage().console.log("responseUrl: ", responseUrl);
        if (!responseUrl) {
            chrome.extension.getBackgroundPage().console.log("responseUrl not found")
        }
        var code = responseUrl.match(/\?code=([\w\/\-]+)/)[1];
        $.ajax({
            url: config.account_url + "oauth/access_token/",
            type: "POST",
            data: {
                grant_type: "authorization_code",
                code: code
            },
            complete: function(jqXHR, textStatus) {
                chrome.extension.getBackgroundPage().console.log("status1: ", jqXHR.status);
                console.log("status2: ", jqXHR.status);
                switch (jqXHR.status) {
                    case 200:
                        jwt = jqXHR.responseJSON;
                        saveToken(jwt);
                        generate_notification(chrome.i18n.getMessage("notification_title_loggedin"), chrome.i18n.getMessage("notification_message_loggedin"));
                        show_user_portal_notification();
                        callback("OK");
                        break;
                    case 400:
                        generate_notification(chrome.i18n.getMessage("notification_title_error_general"), chrome.i18n.getMessage("notification_message_error_login"));
                        logout();
                        callback("ERROR");
                        break
                }
            },
            beforeSend: function(xhr) {
                xhr.setRequestHeader("Authorization", "Basic " + btoa(config.client_id + ":"))
            }
        })
    })
}

function generate_notification(title, text) {
    var message_setup = {
        type: "basic",
        title: title,
        message: text,
        iconUrl: "../images/icons/ezeep-icon-24@2x.png"
    };
    chrome.notifications.create(text, message_setup)
}

function show_user_portal_notification() {
    let userPortalNotificationID = null;
    chrome.notifications.create("", {
        type: "basic",
        iconUrl: "../images/icons/ezeep-icon-24@2x.png",
        title: "View and Change Printers",
        message: "You can use your ezeep user portal to see and if permitted change the printers which will be available for printing.",
        buttons: [{
            title: "Yes, bring me to my User Portal"
        }]
    }, function(id) {
        userPortalNotificationID = id
    });
    chrome.notifications.onButtonClicked.addListener(function(notifId, btnIdx) {
        if (notifId === userPortalNotificationID) {
            if (btnIdx === 0) {
                window.open(config.portal_url)
            }
        }
    })
}

function getExpirationDate(data) {
    var datenow = new Date(Date.now());
    var expireDate = datenow.setTime(datenow.getTime() + 1e3 * data.expires_in);
    return expireDate
}

function loadConfig(callback) {
    var url = chrome.runtime.getURL(configPath);
    fetch(url).then(function(response) {
        return response.json()
    }).then(function(response) {
        chrome.extension.getBackgroundPage().console.log(response);
        console.log(response);
        config.account_url = response.account_url;
        config.api_url = response.api_url;
        config.client_id = response.client_id;
        config.portal_url = response.portal_url;
        config.print_service_url = response.print_service_url
    }).then(function() {
        if (callback) callback()
    })
}

function getPrinterList(callback) {
    if (!jwt && !jwt.access_token) return;
    var printers = [];
    $.ajax({
        url: config.api_url + "sfapi/GetPrinter",
        type: "GET",
        statusCode: {
            500: function() {
                var message_setup = {
                    type: "basic",
                    title: chrome.i18n.getMessage("notification_title_general_error"),
                    message: chrome.i18n.getMessage("notification_message_general_error"),
                    iconUrl: "../images/icons/ezeep-icon-24@2x.png"
                };
                chrome.notifications.create(text, message_setup);
                callback(printers)
            },
            200: function(data) {
                chrome.extension.getBackgroundPage().console.log(data, data.length);
                console.log(data, data.length);
                if (data.length > 0) {
                    data.forEach(function(item) {
                        printers.push({
                            id: item.id,
                            name: item.name,
                            description: item.location
                        })
                    })
                } else {
                    var message_setup = {
                        type: "basic",
                        title: chrome.i18n.getMessage("notification_title_no_printers_found"),
                        message: chrome.i18n.getMessage("notification_message_no_printers_found"),
                        iconUrl: "../images/icons/ezeep-icon-24@2x.png"
                    };
                    chrome.notifications.create("notification_message_no_printers_found", message_setup)
                }
                callback(printers)
            }
        }
    })
}

function saveToken(data) {
    if (!data) {
        data = {}
    }
    data.access_token = data.access_token || "";
    data.refresh_token = data.refresh_token || "";
    data.token_type = data.token_type || "";
    data.expires_in = data.expires_in || "";
    data.scope = data.scope || "";
    chrome.storage.sync.set({
        access_token: data.access_token
    });
    chrome.storage.sync.set({
        refresh_token: data.refresh_token
    });
    chrome.storage.sync.set({
        token_type: data.token_type
    });
    chrome.storage.sync.set({
        expires_in: data.expires_in
    });
    chrome.storage.sync.set({
        scope: data.scope
    });
    data.expiration_date = data.expires_in && getExpirationDate(data) || "";
    chrome.storage.sync.set({
        expiration_date: data.expiration_date
    });
    jwt = data
}

function changeIcon() {
    chrome.browserAction.setIcon({
        path: {
            16: "../images/icons/ezeep-icon-activity-16@2x.png",
            48: "../images/icons/ezeep-icon-activity-24@2x.png",
            128: "../images/icons/ezeep-icon-activity-24@2x.png"
        }
    })
}

function resetToDefaultIcon() {
    chrome.browserAction.setIcon({
        path: {
            16: "../images/icons/ezeep-icon-16@2x.png",
            48: "../images/icons/ezeep-icon-24@2x.png",
            128: "../images/icons/ezeep-icon-24@2x.png"
        }
    })
}