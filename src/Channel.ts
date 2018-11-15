import { TransportMessage } from './Message'

export type OnMessageCallback = (message: {}) => void

export interface Channel {
    timeout: number
    send: (message: TransportMessage) => void
    onData: (cb: OnMessageCallback) => void
    onConnect: (cb: () => void) => void
    onDisconnect: (cb: () => void) => void
    onError: (cb: (e: Error) => void) => void
}
