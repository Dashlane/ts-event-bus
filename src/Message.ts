
export type TransportRequest = { type: 'request', slotName: string, id: string, data: any }
export type TransportResponse = { type: 'response', slotName: string, id: string, data: any }
export type TransportError = { type: 'error', slotName: string, id: string, message: string, stack?: string }
export type TransportRegistrationMessage = { type: 'handler_registered', slotName: string }
export type TransportMessage =
    TransportRegistrationMessage
    | TransportRequest
    | TransportResponse
    | TransportError
