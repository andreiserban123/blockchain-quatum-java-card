package com.example.javacard.hello;

import javacard.framework.*;
import javacard.security.*;


public class PinHashApplet extends Applet {


    private static final byte INS_VERIFY_PIN = (byte) 0x20;
    private static final byte INS_HASH = (byte) 0x30;
    private static final byte INS_PUB_KEY = (byte) 0x41;
    private static final byte INS_SIGN = (byte) 0x40;
    private static final byte INS_RSA_SIGN = (byte) 0x42;
    private static final byte INS_RSA_PUB_KEY = (byte) 0x43;

    private final MessageDigest digest;
    private final OwnerPIN pin;
    private final KeyPair keyPair;
    private final Signature signature;
    private final KeyPair rsaKeyPair;
    private final Signature rsaSignature;

    private PinHashApplet() {

        pin = new OwnerPIN((byte) 0x03, (byte) 0x04);
        pin.update(new byte[]{'1', '2', '3', '4'}, (short) 0, (byte) 4);
        digest = MessageDigest.getInstance(MessageDigest.ALG_SHA_256, false);
        keyPair = new KeyPair(KeyPair.ALG_EC_FP, KeyBuilder.LENGTH_EC_FP_256);
        keyPair.genKeyPair();

        signature = Signature.getInstance(Signature.ALG_ECDSA_SHA_256, false);
        signature.init(keyPair.getPrivate(), Signature.MODE_SIGN);

        rsaKeyPair = new KeyPair(KeyPair.ALG_RSA, KeyBuilder.LENGTH_RSA_2048);
        rsaKeyPair.genKeyPair();

        rsaSignature = Signature.getInstance(Signature.ALG_RSA_SHA_256_PKCS1, false);
        rsaSignature.init(rsaKeyPair.getPrivate(), Signature.MODE_SIGN);

        register();
    }

    public static void install(byte[] installData, short offset, byte length) {
        new PinHashApplet();
    }

    @Override
    public void process(APDU apdu) throws ISOException {
        if (selectingApplet()) {
            return;
        }
        byte[] buffer = apdu.getBuffer();
        byte ins = buffer[ISO7816.OFFSET_INS];

        switch (ins) {
            case INS_VERIFY_PIN:
                verifyPin(apdu);
                break;
            case INS_HASH:
                doHash(apdu);
                break;
            case INS_PUB_KEY:
                getPub(apdu);
                break;
            case INS_SIGN:
                sign(apdu);
                break;
            case INS_RSA_SIGN:
                signRsa(apdu);
                break;
            case INS_RSA_PUB_KEY:
                getRsaPub(apdu);
                break;
            default:
                ISOException.throwIt(ISO7816.SW_INS_NOT_SUPPORTED);
        }
    }

    private void signRsa(APDU apdu) {
        byte[] buffer = apdu.getBuffer();
        short length = apdu.setIncomingAndReceive();

        short signatureLength = rsaSignature.sign(
                buffer,
                ISO7816.OFFSET_CDATA,
                length,
                buffer,
                (short) 0
        );
        apdu.setOutgoingAndSend((short) 0, signatureLength);
    }

    private void getRsaPub(APDU apdu) {
        byte[] buffer = apdu.getBuffer();
        RSAPublicKey key = (RSAPublicKey) rsaKeyPair.getPublic();
        short length;

        switch (buffer[ISO7816.OFFSET_P1]) {
            case (byte) 0x00:
                length = key.getModulus(buffer, (short) 0);
                break;
            case (byte) 0x01:
                length = key.getExponent(buffer, (short) 0);
                break;
            default:
                ISOException.throwIt(ISO7816.SW_INCORRECT_P1P2);
                return;
        }

        apdu.setOutgoingAndSend((short) 0, length);
    }

    private void sign(APDU apdu) {
        byte[] buffer = apdu.getBuffer();
        short length = apdu.setIncomingAndReceive();

        short sLength = signature.sign(
                buffer,
                (short) 5,
                length,
                buffer,
                (short) 0
        );
        apdu.setOutgoingAndSend((short) 0, sLength);
    }

    private void getPub(APDU apdu) {
        byte[] buffer = apdu.getBuffer();

        ECPublicKey key = (ECPublicKey) keyPair.getPublic();
        short len = key.getW(
                buffer,
                (short) 0
        );
        apdu.setOutgoingAndSend((short) 0, len);
    }

    private void doHash(APDU apdu) {
        byte[] buffer = apdu.getBuffer();
        short length = apdu.setIncomingAndReceive();

        short dLength = digest.doFinal(
                buffer,
                ISO7816.OFFSET_CDATA,
                length,
                buffer,
                (short) 0
        );

        apdu.setOutgoingAndSend((short) 0, dLength);
    }

    private void verifyPin(APDU apdu) {
        byte[] buffer = apdu.getBuffer();
        short length = apdu.setIncomingAndReceive();

        if (!pin.check(buffer, ISO7816.OFFSET_CDATA, (byte) length)) {
            byte tries = pin.getTriesRemaining();
            ISOException.throwIt((short) (0x63C0 | tries));
        }
    }
}
/*
 * CUM INTERACTIONEZ CU UN SMART CARD
 *
 * Codul de conectare la cititor/card ruleaza in aplicatia client, nu in
 * applet. Applet-ul este deja instalat pe card si asteapta comenzi APDU
 * in metoda process().
 *
 * Fluxul din client este:
 * 1. Gaseste un terminal (cititor).
 * 2. Se conecteaza la card.
 * 3. Selecteaza applet-ul dupa AID.
 * 4. Trimite APDU-urile definite mai jos si verifica status word-ul.
 *
 * Exemplu de client Java folosind javax.smartcardio:
 *
 * TerminalFactory factory = TerminalFactory.getDefault();
 * CardTerminal terminal = factory.terminals().list().get(0);
 * terminal.waitForCardPresent(0);
 *
 * Card card = terminal.connect("*");
 * CardChannel channel = card.getBasicChannel();
 *
 * // AID-ul applet-ului: F0 00 00 00 01 01
 * byte[] appletAid = {
 *     (byte) 0xF0, 0x00, 0x00, 0x00, 0x01, 0x01
 * };
 *
 * // SELECT: CLA=00, INS=A4, P1=04, P2=00, DATA=AID
 * ResponseAPDU selectResponse = channel.transmit(
 *     new CommandAPDU(0x00, 0xA4, 0x04, 0x00, appletAid)
 * );
 * if (selectResponse.getSW() != 0x9000) {
 *     throw new IllegalStateException("SELECT failed");
 * }
 *
 * // Exemplu: trimite PIN-ul "1234".
 * byte[] pin = {'1', '2', '3', '4'};
 * ResponseAPDU pinResponse = channel.transmit(
 *     new CommandAPDU(0x00, 0x20, 0x00, 0x00, pin)
 * );
 *
 * // Exemplu: calculeaza SHA-256 pentru un mesaj.
 * byte[] message = "hello".getBytes(StandardCharsets.UTF_8);
 * ResponseAPDU hashResponse = channel.transmit(
 *     new CommandAPDU(0x00, 0x30, 0x00, 0x00, message, 32)
 * );
 * byte[] hash = hashResponse.getData();
 *
 * card.disconnect(false);
 *
 * Forma bruta a comenzii SELECT este:
 * 00 A4 04 00 06 F0 00 00 00 01 01
 *
 * Un raspuns reusit se termina cu status word 90 00.
 *
 * Pe card, SELECT ajunge tot in process(). In timpul selectarii,
 * selectingApplet() este true, deci revenim fara sa tratam INS=A4 ca pe
 * una dintre comenzile proprii ale applet-ului.
 */