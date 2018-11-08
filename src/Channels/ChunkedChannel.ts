import { GenericChannel } from './GenericChannel'
import { TransportMessage, isTransportMessage } from '../Message'

export type ChunkedMessageStart = { type: 'chunk_start', chunkId: string, size: number }
export type ChunkedMessage = { type: 'chunk_data', chunkId: string, data: any }
export type ChunkedMessageEnd = { type: 'chunk_end', chunkId: string }
export type ChunkedTransportMessage = ChunkedMessageEnd | ChunkedMessageStart | ChunkedMessage

/**
 * A chunk is a array of bytes.
 * It is stored as a array of numbers and is manipulated using a Uint16Array.
 */
type Chunk = number[]

interface ChunkBuffer {
    [chunkId: string]: {
        id: string
        chunks: Chunk[]
        size: number
    }
}

const utils = {

    getRandomId: () => [...Array(30)].map(() => Math.random().toString(36)[3]).join(''),

    str2byteArray: (str: string) => {
        const bufView = new Uint16Array(str.length)
        for (let i = 0, strLen = str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i)
        }

        return bufView
    },

    convertUintArrayToString: (a: Uint16Array, maxStringAlloc: number) => {
        if (maxStringAlloc === -1) {
            return String.fromCharCode.apply(null, a)
        } else {
            let result = ''
            for (let i = 0; i < a.length; i += maxStringAlloc) {
                if (i + maxStringAlloc > a.length) {
                    result += String.fromCharCode.apply(null, a.subarray(i))
                } else {
                    result += String.fromCharCode.apply(null, a.subarray(i, i + maxStringAlloc))
                }
            }
            return result

        }
    },

    checkForChunkId: (message: ChunkedTransportMessage) => {
        if (!message.chunkId) {
            throw new Error(`ChunkedMessage did not have a chunkId: ${JSON.stringify(message)}`)
        }
    }

}

export interface ChunkedChannelConstructorOptions {
    chunkSize: number
    sender: (m: TransportMessage) => void
    timeout?: number
    maxStringAlloc?: number
}

/**
 * Overrides the `send` and `_messageReceived` methods of the GenericChannel class
 * to offer transparent message chunking over a fragile underlying channel.
 */
export class ChunkedChannel extends GenericChannel {
    constructor(opts: ChunkedChannelConstructorOptions) {
        super(opts.timeout)
        this._chunkSize = opts.chunkSize
        this._sender = opts.sender
        this._maxStringAlloc = opts.maxStringAlloc || -1
    }

    /**
     * The size of the data array in each chunk.
     * Note that the total "size" of the message will be larger
     * because of the chunking metadata.
     */
    private _chunkSize: number

    /**
     * Defines the maximum string length that will be allocated at once when
     * merging the buffered chunks into the original string.
     * This is only needed if the environment where this instance is running applies restriction
     * on memory for string allocation.
     * Omitting to set this will just create the string from the chunks in one go.
     */
    private _maxStringAlloc: number

    /** The actual sending via the underlying channel (eg. websocket) */
    protected _sender: (m: TransportMessage | ChunkedTransportMessage) => void

    /** Stores chunks pending flush */
    private _buffer: ChunkBuffer = {}

    /**
     * This method override will chunk messages so that an array of no more than
     * `chunkSize` bytes (excluding internal metadata) will be sent for each call
     * to a given slot.
     */
    public send(message: TransportMessage) {
        const stringified = JSON.stringify(message)
        if (stringified.length <= this._chunkSize) {
            this._sender(message)
            return
        }

        const messageAsByteArray = utils.str2byteArray(stringified)
        const chunkId = utils.getRandomId()

        this._sender({
            type: 'chunk_start',
            chunkId,
            size: stringified.length
        })

        const sendChunks = (start = 0) => {
            let chunk = messageAsByteArray.slice(start, start + this._chunkSize)
            if (chunk.length) {
                this._sender({
                    type: 'chunk_data',
                    chunkId,

                    // To avoid having the underlying channel implemetation interpret/cast
                    // the UintArray into something else, we explicitely send an array
                    data: Array.from(chunk)
                })
                sendChunks(start + this._chunkSize)
            }
        }
        sendChunks()

        this._sender({
            type: 'chunk_end',
            chunkId
        })

    }

    /**
     * When a message is received on this channel, either it has been chunked because its original size
     * was greater than the chunkSize in which case it will be a `ChunkedTransportMessage`,
     * or it was small enough so that it could be sent un chunked in which
     * case it will be a plain `TransportMessage`.
     */
    protected _messageReceived(message: TransportMessage | ChunkedTransportMessage) {

        switch (message.type) {
            case 'chunk_start':
                this._receiveNewChunk(message)
                break

            case 'chunk_data':
                this._receiveChunkData(message)
                break

            case 'chunk_end':
                const decodedMessage: TransportMessage = this._mergeChunks(message)
                super._messageReceived(decodedMessage)
                break

            default:
                // If the message is small enough, it won't be chunked before sending
                // so it won't need merging/buffering here
                super._messageReceived(message as TransportMessage)
        }

    }

    private _receiveNewChunk(message: ChunkedMessageStart) {
        utils.checkForChunkId(message)
        if (this._buffer[message.chunkId]) {
            throw new Error(`There was already an entry in the buffer for chunkId ${message.chunkId}`)
        }

        this._buffer[message.chunkId] = {
            id: message.chunkId,
            chunks: [],
            size: message.size
        }
    }

    private _receiveChunkData(message: ChunkedMessage) {
        utils.checkForChunkId(message)
        if (!this._buffer[message.chunkId]) {
            throw new Error(`ChunkId ${message.chunkId} was not found in the buffer`)
        }

        this._buffer[message.chunkId].chunks.push(message.data)
    }

    private _mergeChunks(message: ChunkedMessageEnd): TransportMessage {
        utils.checkForChunkId(message)
        if (!this._buffer[message.chunkId]) {
            throw new Error(`ChunkId ${message.chunkId} was not found in the buffer`)
        }

        // Store all the chunks into one Uint16Array
        const mergedChunks = this._buffer[message.chunkId].chunks.reduce((d, chunk, ix) => {
            chunk.forEach((byte, i) => d.uintArray[d.currentIx + i] = byte)
            d.currentIx += chunk.length
            return d
        }, { uintArray: new Uint16Array(this._buffer[message.chunkId].size), currentIx: 0 })

        let transportMessage: TransportMessage

        // Then rebuild the object from the merged chunk, now stored as one string
        const dataAsString = utils.convertUintArrayToString(mergedChunks.uintArray, this._maxStringAlloc)
        try {
            transportMessage = JSON.parse(dataAsString) as TransportMessage
        } catch (e) {
            throw new Error(`Not a valid JSON string: ${dataAsString}`)
        }

        if (!isTransportMessage(transportMessage)) {
            throw new Error(`Not a transport message: ${JSON.stringify(transportMessage)}`)
        }

        return transportMessage
    }

}

