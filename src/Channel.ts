import { TransportMessage } from './Message'

export type OnMessageCallback = (message: {}) => void

export interface Channel {
    timeout: number
    /**
     * Orders the channel to reconnect.
     *
     * @remarks To implement in order to benefit from the auto-reconnect feature.
     * See the {@link ../README.md | README} for more context.
     */
    autoReconnect?: () => void
    send: (message: TransportMessage) => void
    onData: (cb: OnMessageCallback) => void
    onConnect: (cb: () => void) => void
    onDisconnect: (cb: () => void) => void
    onError: (cb: (e: Error) => void) => void
}
