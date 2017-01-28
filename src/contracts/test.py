from unittest import TestCase, main
from rlp.utils import encode_hex, decode_hex
from web3.utils.encoding import to_hex
from ethereum import tester as t
from ethereum.tester import TransactionFailed
from ethereum import keys
import time
from sha3 import sha3_256
import os


class AtomicThingTest(TestCase):

    def setUp(self):

        self.s = t.state()

        atom_code = open('atomic.sol').read()
        self.atomicthing = self.s.abi_contract(atom_code, language='solidity', sender=t.k0)

        self.o = []
        self.s.block.log_listeners.append(lambda x: self.o.append(self.atomicthing.translator.listen(x)))

    def testHoldCycle(self):

        external_id1 = to_hex("e1")
        external_id2 = to_hex("e2")
        external_id3 = to_hex("e3")

        self.atomicthing.createHold(
            keys.privtoaddr(t.k1),
            100000,
            1485685902,
            decode_hex(to_hex(external_id1)[2:].zfill(64))
        )

        hold_id1 = self.atomicthing.holdIDForParameters(
            keys.privtoaddr(t.k0),
            keys.privtoaddr(t.k1),
            100000,
            1485685902,
            decode_hex(to_hex(external_id1)[2:].zfill(64))
        )

        self.assertEqual(hold_id1, self.o[0]['hold_id'], "We got the expected hold ID in the logs")

        self.assertEqual(self.atomicthing.balancePayable([hold_id1]), 100000) 

        hold_id2 = self.atomicthing.holdIDForParameters(
            keys.privtoaddr(t.k0),
            keys.privtoaddr(t.k2),
            200000,
            1485685904,
            decode_hex(to_hex(external_id2)[2:].zfill(64))
        )

        self.atomicthing.createHold(
            keys.privtoaddr(t.k2),
            200000,
            1485685904,
            decode_hex(to_hex(external_id2)[2:].zfill(64))
        )

        self.assertEqual(hold_id2, self.o[1]['hold_id'], "We got the expected hold ID in the logs")

        self.assertEqual(encode_hex(self.atomicthing.user_holds(keys.privtoaddr(t.k0), 1)), encode_hex(hold_id2))
        self.assertEqual(encode_hex(self.atomicthing.company_holds(keys.privtoaddr(t.k2), 0)), encode_hex(hold_id2))

        self.assertEqual(self.atomicthing.getHoldStatus(hold_id2), 1)

        self.assertEqual(self.atomicthing.balancePayable([hold_id1, hold_id2]), 100000+200000) 
        self.assertTrue(self.atomicthing.isValid([hold_id1, hold_id2]))

        self.atomicthing.removeHoldByUser(hold_id1)
        self.assertEqual(self.atomicthing.getHoldStatus(hold_id1), 0)
        self.assertFalse(self.atomicthing.isValid([hold_id1, hold_id2]))
        self.assertEqual(self.atomicthing.balancePayable([hold_id1, hold_id2]), 200000) 
        self.assertTrue(self.atomicthing.isValid([hold_id2]))

        hold_id3 = self.atomicthing.holdIDForParameters(
            keys.privtoaddr(t.k0),
            keys.privtoaddr(t.k4),
            250000,
            1485685904,
            decode_hex(to_hex(external_id3)[2:].zfill(64))
        )
        self.assertNotEqual(encode_hex(hold_id1), encode_hex(hold_id3))
        self.atomicthing.createHold(
            keys.privtoaddr(t.k4),
            250000,
            1485685904,
            decode_hex(to_hex(external_id3)[2:].zfill(64))
        )

        self.assertEqual(self.atomicthing.getHoldStatus(hold_id2), 1)
        self.assertEqual(self.atomicthing.getHoldStatus(hold_id3), 1)

        failed = False
        try:
            self.atomicthing.complete([hold_id2, hold_id3], value=(200000))
        except TransactionFailed:
            failed = True
        self.assertTrue(failed, "Should fail with insufficient value")

        self.atomicthing.complete([hold_id2, hold_id3], value=(200000+250000))


if __name__ == '__main__':
    main()
