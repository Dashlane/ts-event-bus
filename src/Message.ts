export type TransportRequest = { type: 'request', slotName: string, id: string, data: any }
export type TransportResponse = { type: 'response', slotName: string, id: string, data: any }
export type TransportError = { type: 'error', slotName: string, id: string, message: string, stack?: string }
export type TransportRegistrationMessage = { type: 'handler_registered', slotName: string }
export type TransportUnregistrationMessage = { type: 'handler_unregistered', slotName: string }
export type TransportMessage =
    TransportRegistrationMessage
    | TransportUnregistrationMessage
    | TransportRequest
    | TransportResponse
    | TransportError

export function isTransportMessage(m: { type: string }): m is TransportMessage {
    switch (m.type) {
        case 'request':
        case 'response':
        case 'error':
        case 'handler_unregistered':
        case 'handler_registered':
            return true
        default:
            return false
    }
}
