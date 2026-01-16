import * as flatbuffers from 'flatbuffers';
import * as GamePacket from '../packet_gen/game-packet';

export class PacketUtils {
    // We strictly use GameMessage as the root type now.
    // The framing is: [Size (4 bytes)] + [GameMessage Buffer]

    static serializePacket(builder: flatbuffers.Builder, packetType: GamePacket.PacketData, packetOffset: flatbuffers.Offset): Uint8Array {
        // Create GameMessage
        GamePacket.GameMessage.startGameMessage(builder);
        GamePacket.GameMessage.addDataType(builder, packetType);
        GamePacket.GameMessage.addData(builder, packetOffset);
        const endOffset = GamePacket.GameMessage.endGameMessage(builder);

        builder.finish(endOffset);
        const fbBuffer = builder.asUint8Array();

        // Add 4-byte size header
        const size = fbBuffer.length;
        const buffer = new Uint8Array(4 + size);
        const view = new DataView(buffer.buffer);

        view.setUint32(0, size, true); // Little Endian Size
        buffer.set(fbBuffer, 4);

        return buffer;
    }
}
