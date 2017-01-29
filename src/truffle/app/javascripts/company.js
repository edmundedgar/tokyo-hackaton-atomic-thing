var accounts;
var account;

function addToDocument(log_item) {

    console.log('addToDocument', log_item);

    var hold_id = log_item['args']['hold_id'];
    console.log('looking for hold id ',hold_id);

    if (document.getElementById(hold_id)) {
      console.log('already got', log_item);
      if (log_item['args']['status'] == 2) {
          $('#'+hold_id).addClass('completed');
      } else if (log_item['args']['status'] == 0) {
          $('#'+hold_id).delete();
      }
      return; 
    }

    console.log('adding row');
    var rw = $('.template-row').clone();
    rw.attr('id', hold_id);

    rw.find('.txid').text(log_item['transactionHash']);
    rw.find('.hold_id').text(hold_id);
    rw.find('.user').text(log_item['args']['user']);
    rw.find('.price').text(web3.fromWei(log_item['args']['price'], 'ether'));
    rw.find('.external_id').text(web3.toAscii(log_item['args']['external_id']));
    rw.find('.expiry').text(new Date(log_item['args']['expiry']*1000).toString());

    rw.find('.remove').find('button').click( function() {
      $('#'+hold_id).addClass('request-cancel');
      requestCancel(hold_id);
    });

    $('.template-row').after(rw);
    rw.css('display:block');
    rw.show();

}

function requestCancel(hold_id) {
  console.log('request cancel');
  var atomic = Atomic.deployed();

  atomic.removeHoldByCompany(hold_id, {from: account}).then(function() {
    $('#'+hold_id).delete();
  }).catch(function(e) {
    $('#'+hold_id).removeClass('request-cancel').addClass('request-cancel-failed');
  });

}

function watchCompanyEvent(addr) {

  var atomic = Atomic.deployed();
  var event = atomic.LogHoldChange();

  event.watch(function(error, result){
    if (!error) {
      console.log('watch for', addr);
      if (result['args']['company'] != addr) {
        console.log('skipping, event not for us');
        return;
      }
      addToDocument(result);
      console.log(result);
    } else {
      console.log('!!!ERROR!!!')
    }
  })
}

/*
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
*/

window.onload = function() {

  var pair = location.search.substring(1).split('&');
  var watch_account = pair[0];

  watchCompanyEvent(watch_account);

}
