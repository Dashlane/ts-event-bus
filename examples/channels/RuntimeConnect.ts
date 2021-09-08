import { GenericChannel } from './../../src/Channels/GenericChannel'
import { TransportMessage } from './../../src/Message'


export enum PortNames {
    PortOne = 'PortOne',
    PortTwo = 'PortTwo',
}

/**
 * Channel used in an MV3 extension context
 * Connection with a Service Worker background script
 */
export class RuntimeConnect extends GenericChannel {
    public constructor(name: PortNames) {
        super();
        this.name = name;
    }

    private name: PortNames;

    private port: chrome.runtime.Port | undefined;

    /**
     * Initiate a port connection
     */
    public connect() {
        this.setup(this.name);
    }

    /**
     * Automatically called when a Slot is triggered and the channel is disconnected
     */
    public autoReconnect() {
        this.connect();
    }

    /**
     * Send a message through the given port
     */
    public send(message: any): void {
        if (!this.port) {
            throw new Error('No port to send message');
        }
        this.port.postMessage(message);
    }

    /**
     * Setup incoming message handling, disconnections, and
     * connection status when initiating a connection
     */
    private setup(portName: PortNames) {
        this.port = chrome.runtime.connect({ name: portName });
        this.port.onMessage.addListener((message: TransportMessage) =>
            this._messageReceived(message)
        );
        this.port.onDisconnect.addListener(() => {
            this.port = undefined;
            this._disconnected();
        });
        this._connected();
    }
}
