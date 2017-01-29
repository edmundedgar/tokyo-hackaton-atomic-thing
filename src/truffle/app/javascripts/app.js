var accounts;
var account;
var totalAmount = 0;
var hold_ids = [];

function watchEvent() {
  var atomic = Atomic.deployed();
  var event = atomic.LogHoldChange();

  event.watch(function(error, result){
    if (!error) {
      console.log('LogHoldChange',result);
      $('.price').each(function(){
        totalAmount = totalAmount + parseFloat(($(this).text()));
        console.log(totalAmount);
      })
      $('#total').text(totalAmount);
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

function balancePayable(){
  var atomic = Atomic.deployed();
  getUserHolds();
  atomic.balancePayable.call(hold_ids, {from: account}).then(function(value){
    console.log(value);
  }).catch(function(e){
    console.log(e);
  });
}

function isValid(){
  var atomic = Atomic.deployed();

  getUserHolds();
  atomic.isValid.call(hold_ids, {from: account}).then(function(value){
    console.log(value);
  }).catch(function(e){
    console.log(e);
  });

}

function removeHoldByUser(extid){
}

function getUserHolds(){
  var atomic = Atomic.deployed();
  hold_ids = [];
  atomic.countUserHolds.call(account).then(function(value){
    console.log(value.c[0]);
    holdCount = value.c[0];
    for (var i = holdCount - 1; i >= 0; i--) {
      atomic.userHoldAtIndex.call(account, i).then(function(item){
        hold_ids.push(item[0]);
        console.log('item0',item[0]);
      }).catch(function(e){
        console.log(e);
      });
    }
  });
  console.log('hold_ids', hold_ids);
}

function complete(){
  var atomic = Atomic.deployed();
  getUserHolds();
  atomic.isValid.call(hold_ids).then(function(bool){
    console.log('hold_ids', hold_ids[2]);
    if (bool) {
      atomic.balancePayable.call(hold_ids).then(function(val){
        console.log('val',val.toString());
      }).catch(function(e){
        console.log(e);
      });

    } else {
      console.log(bool)
    }
  }).catch(function(e){
    console.log(e);
  });

}

function initHoldList(){
  var atomic = Atomic.deployed();
  var holdCount;

  var $target = $('tbody');

  // insert from URL_Parameter *Need ADD/REMOVE Button.
  var pair = location.search.substring(1).split('&');
  var ffff = 'http://localhost:8080/images/car.json';
  ffff = web3.toHex(ffff);
  console.log(ffff);
  pair = web3.toAscii(pair[0])
  if (pair) {
    $.ajax({
      type: 'get',
      dataType: 'json',
      url: pair
    }).done(function(res) {
      // console.log(res);
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
          $price = $('<h2 />').addClass('title price').text(data.price),
          $expiry = $('<h2 />').addClass('title').text(new Date(parseInt(data.expiry))),
          $addBtn = $('<button />').addClass('add').attr('data-price', web3.toWei(data.price, 'ether')).attr('data-expiry', data.expiry).attr('data-extid', web3.toHex(data.external_id)).attr('data-company', '0xdc36523ab6692b68e5a37614118aaa675691abcd').attr('data-url', pair).text(' ADD ');

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
  }

  //insert from Contract *Need REMOVE Button.
  atomic.countUserHolds.call(account).then(function(value){
    console.log(value);
    holdCount = value.c[0];
    for (var i = holdCount - 1; i >= 0; i--) {
      atomic.userHoldAtIndex.call(account, i).then(function(item){
        // console.log('item', item)
        $.ajax({
          type: 'get',
          dataType: 'json',
          url: item[8]
        }).done(function(res) {
          // console.log(res);
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
              $price = $('<h2 />').addClass('title price').text(data.price),
              $expiry = $('<h2 />').addClass('title').text(new Date(parseInt(data.expiry)));

          $holdThumbWrap.append($photo);
          $holdDetailWrap.append($title).append($detail);
          $holdPriceWrap.append($price);
          $holdExpiryWrap.append($expiry);
          $container.append($holdThumbWrap).append($holdDetailWrap).append($holdPriceWrap).append($holdExpiryWrap);

          $target.append($container);
          }).fail(function(e){
            console.log(e);
          });
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
    // console.log('currentAccount', account)

    initHoldList();
    watchEvent();
    getUserHolds();
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

  $('body').on('click', '.remove', function(event) {
    console.log('hogehoge');
  })

  $('#reserve').on('click', function(){
    complete();
  })
}
