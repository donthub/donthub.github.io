const timeoutMillis = 15 * 60 * 1000;
const messages = [];
let previousSeqId;
let seqId;
let joinTime;
let lastRefresh;

function generateCode() {
    return String(Math.round(Math.random() * 1000 + 1)).padStart(4, '0');
}

function getClient() {
    const name = localStorage.getItem('name');
    const clientId = localStorage.getItem('client_id');
    return `${name}#${clientId}`;
}

function initSettings() {
    $.ajaxSetup({
        xhrFields: {withCredentials: true},
        crossDomain: true
    });
}

function generateClientId() {
    const clientId = localStorage.getItem('client_id');
    if (!clientId) {
        const generatedClientId = generateCode();
        localStorage.setItem('client_id', generatedClientId);
    }
}

function fillName() {
    const name = localStorage.getItem('name');
    const clientId = localStorage.getItem('client_id');
    $('#name').val(name);
    $('#client_id').text(clientId);
}

function enter() {
    const inviteCodeMatch = /[?&]code=([^&]+)/g.exec(location.search);
    if (inviteCodeMatch) {
        const code = localStorage.getItem('code');
        const inviteCode = inviteCodeMatch[1];
        if (code == inviteCode) {
            enterRoom();
        } else {
            enterJoinScreen(inviteCode);
        }
        return;
    } else {
        enterHomeScreen();
    }
}

function requireName() {
    const name = $('#name').val();
    localStorage.setItem('name', name);
    $('#name').val(name);
    $('#create').prop('disabled', !name);
    $('#join_manually').prop('disabled', !name);
    $('#join_by_invite').prop('disabled', !name);
    $('#raise_hand').prop('disabled', !name);
    $('#lower_hand').prop('disabled', !name);
}

function enterHomeScreen() {
    const code = localStorage.getItem('code');
    $('#home_code').val(code);
    $('#join').css('display', 'none');
    $('#room').css('display', 'none');
    $('#home').css('display', 'block');
}

function enterJoinScreen(inviteCode) {
    $("#join_code").text(inviteCode);
    $('#home').css('display', 'none');
    $('#room').css('display', 'none');
    $('#join').css('display', 'block');
}

function enterRoom() {
    const code = localStorage.getItem('code');
    if (window.location.search !== `?code=${code}`) {
        window.location.search = `?code=${code}`;
    }
    $('#room_code').text(code);
    $('#home').css('display', 'none');
    $('#join').css('display', 'none');
    $('#room').css('display', 'block');
    joinTime = Date.now();
    send('JOIN');
    receive(true);

    setInterval(function() {
        refreshQueue();
    }, 1000);
}

function receive(isFirst) {
    const code = localStorage.getItem('code');
    const firstSeqId = isFirst ? '?SeqId=1' : '';
    $.get(`https://demo.httprelay.io/mcast/RaiseHand${code}${firstSeqId}`)
    .done(function (data, textStatus, request) {
        processMessage(data);
        previousSeqId = seqId;
        seqId = Number(request.getResponseHeader('httprelay-seqid'));
    })
    .always(function () {
        if (!isFirst && previousSeqId === seqId) {
            $('#error').text('Please enable cookies to use this app!');
            $('#raise_hand').prop('disabled', true);
            $('#lower_hand').prop('disabled', true);
        } else {
            receive(false);
        }
    });
}

function send(type, callback) {
    const code = localStorage.getItem('code');
    $.post(`https://demo.httprelay.io/mcast/RaiseHand${code}`, JSON.stringify({
        client: getClient(),
        type: type,
        timestamp: Date.now()
    }))
    .always(callback);
}

function processMessage(messageString) {
    console.log(`Received message: ${messageString}`);
    let message;
    try {
        message = JSON.parse(messageString);
    } catch (err) {
        console.log('Unparseable message');
        return;
    }
    if (!message?.client || !message?.type || !message?.timestamp) {
        console.log('Invalid message');
        return;
    }

    messages.push(message);
}

function refreshQueue() {
    $('#queue ul').empty();
    let queue = [];
    for (const message of messages) {
        if (message.timestamp >= joinTime) {
            $('#queue').css('display', 'block');
            $('#loading').css('display', 'none');
        }
        if (Date.now() - message.timestamp > timeoutMillis) {
            continue;
        }
        if (message.type === 'RAISE') {
            if (!isRaised(queue, message.client)) {
                queue.push(message);
            }
            continue;
        }
        if (message.type === 'LOWER' || message.type === 'LEAVE') {
            queue = queue.filter(queueMessage => queueMessage.client !== message.client);
        }
    }

    $('#queue ul').empty();
    playSound = false;
    for (const queueMessage of queue) {
        const item = $('<li>').text(queueMessage.client);
        $('#queue ul').append(item);
        if (queueMessage.timestamp > lastRefresh) {
            playSound = true;
        }
    }

    if (playSound) {
        $('#sound')[0].play();
    }

    const client = getClient();
    if (isRaised(queue, client)) {
        $('#raise_hand').css('display', 'none');
        $('#lower_hand').css('display', 'block');
    } else {
        $('#lower_hand').css('display', 'none');
        $('#raise_hand').css('display', 'block');
    }

    lastRefresh = Date.now();
}

function isRaised(queue, client) {
    for (let queueMessage of queue) {
        if (queueMessage.client === client) {
            return true;
        }
    }
    return false;
}

function raiseHand() {
    send('RAISE');
}

function lowerHand() {
    send('LOWER');
}

function leaveRoom() {
    send('LEAVE', function() {
        window.location = window.location.href.split('?')[0];
    });
}

$(document).ready(function () {
    $('#name').on('input', function () {
        requireName();
    });

    $('#create').on('click', function (e) {
        const code = generateCode();
        localStorage.setItem('code', code);
        enterRoom();
        e.preventDefault();
    });

    $('#join_manually').on('click', function (e) {
        const code = $('#home_code').val();
        localStorage.setItem('code', code);
        enterRoom();
        e.preventDefault();
    });

    $('#join_by_invite').on('click', function (e) {
        const inviteCodeMatch = /[?&]code=([^&]+)/g.exec(location.search);
        const code = inviteCodeMatch[1];
        localStorage.setItem('code', code);
        enterRoom();
        e.preventDefault();
    });

    $('#leave').on('click', function(e) {
        leaveRoom();
        e.preventDefault();
    });

    $('#raise_hand').on('click', function(e) {
        raiseHand();
        e.preventDefault();
    });

    $('#lower_hand').on('click', function(e) {
        lowerHand();
        e.preventDefault();
    });

    initSettings();
    generateClientId();
    fillName();
    requireName();
    enter();

});
