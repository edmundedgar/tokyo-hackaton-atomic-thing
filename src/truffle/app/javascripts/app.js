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
  atomic.createHold(company, price, expiry, extid, url, {from: account}).then(function() {
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

  var $target = $('tbody');

  // insert from URL_Parameter *Need ADD/REMOVE Button.
  var pair = location.search.substring(1).split('&');
  var ffff = 'http://localhost:8080/images/hotel.json';
  ffff = web3.toHex(ffff);
  console.log(ffff);
   pair = web3.toAscii(pair[0])
  $.ajax({
    type: 'get',
    dataType: 'json',
    url: pair
  }).done(function(res) {
    console.log(res);
    var data = res[0];
    var $container = $('<tr />'),
        $holdThumbWrap = $('<th />'),
        $holdDetailWrap = $('<td />'),
        $holdPriceWrap = $('<td />'),
        $holdExpiryWrap = $('<td />'),
        $btnWrap = $('<td />');

    var $photo = $('<img />').attr('src', data.thumb),
        $title = $('<h2 />').addClass('title').text(data.title),
        $detail = $('<p />').addClass('detail').text(data.detail),
        $price = $('<h2 />').addClass('title').text(web3.toWei(data.price, 'ether')),
        $expiry = $('<h2 />').addClass('title').text(new Date(parseInt(data.expiry))),
        $addBtn = $('<button />').addClass('add').attr('data-price', web3.toWei(data.price, 'ether')).attr('data-expiry', data.expiry).attr('data-extid', web3.toHex(data.external_id)).attr('data-company', '0xdc36523ab6692b68e5a37614118aaa675691abcd').attr('data-url', pair);

    $holdThumbWrap.append($photo);
    $holdDetailWrap.append($title).append($detail);
    $holdPriceWrap.append($price);
    $holdExpiryWrap.append($expiry);
    $btnWrap.append($addBtn);
    $container.append($holdThumbWrap).append($holdDetailWrap).append($holdPriceWrap).append($holdExpiryWrap).append($btnWrap);

    $target.append($container);

  }).fail(function(e){
    console.log(e);
  });

  //insert from Contract *Need REMOVE Button.
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

  $('body').on('click', '.add', function(event) {
    console.log($(this).attr('data-price'));
    var $this = $(this);
    var company = $this.attr('data-company'),
        extid = $this.attr('data-extid'),
        price = $this.attr('data-price'),
        expiry = $this.attr('data-expiry'),
        url = $this.attr('data-url');

    createHold(company, price, expiry, extid, url);
  });
}
