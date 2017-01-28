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

function createHold(company, price, expiry, extid){
  var atomic = Atomic.deployed();
  console.log(company, price, expiry, extid, account)
  atomic.createHold(company, price, expiry, extid, {from: account}).then(function() {
    console.log(atomic);
  }).catch(function(e) {
    console.log(e);
  });

}

function removeHoldByUser(extid){

}

function getHoldStatus(){
  var atomic = Atomic.deployed();
  console.log(atomic.holds.length);
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

    refreshBalance();
    watchEvent();
    getHoldStatus();
  });

  web3.eth.filter("latest").watch(function(e, blockHash) {
    console.log(e, blockHash);
  });
}
