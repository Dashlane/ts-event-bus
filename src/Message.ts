export type TransportRequest = {
    type: 'request',
    slotName: string,
    id: string,
    data: any,
    param: string
}

export type TransportResponse = {
    type: 'response',
    slotName: string,
    id: string,
    data: any,
    param: string
}

export type TransportError = {
    id: string,
    message: string,
    param: string,
    slotName: string,
    stack?: string,
    type: 'error'
}

export type TransportRegistrationMessage = {
    type: 'handler_registered',
    slotName: string,
    param: string
}

export type TransportUnregistrationMessage = {
    type: 'handler_unregistered',
    slotName: string,
    param: string
}

export type TransportEventListMessage = {
    type: 'event_list',
    ignoredEvents: string[]
}

export type TransportMessage =
    TransportError
    | TransportRegistrationMessage
    | TransportRequest
    | TransportResponse
    | TransportUnregistrationMessage
    | TransportEventListMessage

export function isTransportMessage(m: { type: string }): m is TransportMessage {
    switch (m.type) {
        case 'request':
        case 'response':
        case 'error':
        case 'handler_unregistered':
        case 'handler_registered':
        case 'event_list':
            return true
        default:
            return false
    }
}
