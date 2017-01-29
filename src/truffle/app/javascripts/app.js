var accounts;
var account;

function setStatus(message) {
  var status = document.getElementById("status");
  status.innerHTML = message;
};

function refreshBalance() {
  var meta = MetaCoin.deployed();

  meta.getBalance.call(account, {from: account}).then(function(value) {
    var balance_element = document.getElementById("balance");
    balance_element.innerHTML = value.valueOf();
  }).catch(function(e) {
    console.log(e);
    setStatus("Error getting balance; see log.");
  });
};

function sendCoin() {
  var meta = MetaCoin.deployed();

  var amount = parseInt(document.getElementById("amount").value);
  var receiver = document.getElementById("receiver").value;

  setStatus("Initiating transaction... (please wait)");

  meta.sendCoin(receiver, amount, {from: account}).then(function() {
    setStatus("Transaction complete!");
    refreshBalance();
  }).catch(function(e) {
    console.log(e);
    setStatus("Error sending coin; see log.");
  });
};

function watchEvent() {
  var atomic = Atomic.deployed();
  var event = atomic.LogHoldChange();

  event.watch(function(error, result){
    if (!error) {
      console.log(result);
    } else {
      console.log('!!!ERROR!!!')
    }
  })
}

function createHold(company, price, expiry, extid, url){
  var atomic = Atomic.deployed();

  console.log(company, price, expiry, extid, account, url)
  atomic.createHold(company, price, expiry, extid, {from: account}).then(function() {
    console.log(atomic);
  }).catch(function(e) {
    console.log(e);
  });

}

function removeHoldByUser(extid){
}



function getUserHolds(){
  var atomic = Atomic.deployed();
  atomic.countUserHolds.call(account).then(function(value){
    console.log(value);
  }).catch(function(e){
    console.log(e);
  });

  // atomic.user_holds.call().then(function(result){
  //   console.log(result);
  // }).catch(function(e){
  //   console.log(e);
  //   setStatus("Error getting balance; see log.");
  // })
}

function complete(hold_ids){

}

function initHoldList(){
  var atomic = Atomic.deployed();
  var holdCount;
  var pair = location.search.substring(1).split('&');
  var ffff = 'http://4545.jp/atomic/hotel.json';
   pair = web3.toAscii(pair[0])
  console.log(pair)
  atomic.countUserHolds.call(account).then(function(value){
    console.log(value);
    holdCount = value.c[0];
    for (var i = holdCount - 1; i >= 0; i--) {
      atomic.userHoldAtIndex.call(account, i).then(function(item){
        console.log(item);
      }).catch(function(e){
        console.log(e);
      })
    }
  }).catch(function(e){
    console.log(e);
  });

  var $container = $('<tr />'),
        $holdPhotoWrap = $('<th />'),
        $holdTitleWrap = $('<h2 />'),
        $holdDetailWrap = $('<p />'),
        $holdPriceWrap = $('<td />'),
        $holdExpiryWrap = $('<td />'),
        $addBtnWrap = $('<td />'),
        $removeBtnWrap = $('<td />');
}


window.onload = function() {
  web3.eth.getAccounts(function(err, accs) {
    if (err != null) {
      alert("There was an error fetching your accounts.");
      return;
    }

    if (accs.length == 0) {
      alert("Couldn't get any accounts! Make sure your Ethereum client is configured correctly.");
      return;
    }

    accounts = accs;
    account = accounts[0];
    console.log(accs, account)

    // refreshBalance();
    watchEvent();
    initHoldList();
  });

  web3.eth.filter("latest").watch(function(e, blockHash) {
    console.log(e, blockHash);
  });
}
