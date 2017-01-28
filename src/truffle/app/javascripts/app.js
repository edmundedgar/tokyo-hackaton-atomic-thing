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
  var meta = MetaCoin.deployed();
  var event = meta.Transfer();
  
  event.watch(function(error,result){
    console.log('watching "Set" event!',error);
    if (!error) {
      console.log(result);
    } else {
      console.log('!!!ERROR_EVENT!!!');
    }
  })

  var filter = web3.eth.filter('latest');

  filter.watch(function(error,result){
    console.log('watching "Set" filter!',error);
    if (!error) {
      console.log(result);
    } else {
      console.log('!!!ERROR_FILTER!!!');
    }
  })
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
  });

  web3.eth.filter("latest").watch(function(e, blockHash) {
    console.log(e, blockHash);
  });
}
