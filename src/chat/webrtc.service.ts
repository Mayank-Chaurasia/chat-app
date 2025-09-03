type Session = any;

const ensureQB = (): any => {
    const QB = (window as any).QB;
    if (!QB || !QB.webrtc) {
        throw new Error('QuickBlox WebRTC is not available');
    }
    return QB;
};

export type CallEvents = {
    onIncoming: (session: Session, extension?: any) => void;
    onUserNotAnswer?: (session: Session, userId: number) => void;
    onCall?: (session: Session, extension?: any) => void;
    onStop?: (session: Session) => void;
    onReject?: (session: Session, userId: number, extension?: any) => void;
};

let isWebRTCInitialized = false;

export const initWebRTC = (events: CallEvents) => {
    try {
        const QB = ensureQB();
        
        // Prevent multiple initialization
        if (isWebRTCInitialized) {
            console.log('WebRTC already initialized');
            return;
        }

        console.log('Initializing WebRTC...');

        // Incoming call listener
        QB.webrtc.onCallListener = (session: Session, extension: any) => {
            console.log('Incoming call received:', session);
            events.onIncoming(session, extension);
        };

        // User not answer listener
        QB.webrtc.onUserNotAnswerListener = (session: Session, userId: number) => {
            console.log('User not answered:', userId);
            if (events.onUserNotAnswer) events.onUserNotAnswer(session, userId);
        };

        // Call accepted listener
        QB.webrtc.onAcceptCallListener = (session: Session, userId: number, extension: any) => {
            console.log('Call accepted by user:', userId);
            if (events.onCall) events.onCall(session, extension);
        };

        // Call ended/stopped listener
        QB.webrtc.onStopCallListener = (session: Session) => {
            console.log('Call stopped');
            if (events.onStop) events.onStop(session);
        };

        // Call rejected listener
        QB.webrtc.onRejectCallListener = (session: Session, userId: number, extension: any) => {
            console.log('Call rejected by user:', userId);
            if (events.onReject) events.onReject(session, userId, extension);
        };

        isWebRTCInitialized = true;
        console.log('WebRTC initialized successfully');

    } catch (error) {
        console.error('Failed to initialize WebRTC:', error);
        throw error;
    }
};

export const startCall = (opponentsIds: number[], isVideo: boolean = false): Promise<Session> => {
    return new Promise((resolve, reject) => {
        try {
            const QB = ensureQB();
            
            console.log('Starting call with opponents:', opponentsIds, 'Video:', isVideo);
            
            if (!opponentsIds || opponentsIds.length === 0) {
                reject(new Error('No opponents provided for call'));
                return;
            }

            // Filter out invalid IDs
            const validOpponents = opponentsIds.filter(id => id && typeof id === 'number');
            if (validOpponents.length === 0) {
                reject(new Error('No valid opponent IDs provided'));
                return;
            }

            const callType = isVideo ? QB.webrtc.CallType.VIDEO : QB.webrtc.CallType.AUDIO;
            const session = QB.webrtc.createNewSession(validOpponents, callType);
            
            if (!session) {
                reject(new Error('Failed to create WebRTC session'));
                return;
            }

            const mediaParams = {
                audio: true,
                video: isVideo,
                options: { 
                    muted: false, 
                    mirror: true 
                }
            };

            console.log('Getting user media with params:', mediaParams);

            session.getUserMedia(mediaParams, (err: any, stream: any) => {
                if (err) {
                    console.error('Failed to get user media:', err);
                    let errorMessage = 'Failed to access media devices';
                    
                    if (err.name === 'NotAllowedError') {
                        errorMessage = 'Permission denied. Please allow access to your microphone' + (isVideo ? ' and camera' : '');
                    } else if (err.name === 'NotReadableError') {
                        errorMessage = 'Device is already in use. Please close other applications using your microphone/camera';
                    } else if (err.name === 'NotFoundError') {
                        errorMessage = 'No microphone' + (isVideo ? ' or camera' : '') + ' found';
                    }
                    
                    reject(new Error(errorMessage));
                    return;
                }

                console.log('User media obtained, starting call...');
                
                try {
                    // Pass the stream to the call method
                    session.call(null, mediaParams);
                    console.log('Call initiated successfully');
                    resolve(session);
                } catch (callErr: any) {
                    console.error('Failed to initiate call:', callErr);
                    // Cleanup stream on error
                    if (stream && stream.getTracks) {
                        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
                    }
                    reject(new Error('Failed to initiate call: ' + (callErr.message || callErr)));
                }
            });

        } catch (error: any) {
            console.error('Error in startCall:', error);
            reject(new Error(error.message || 'Unknown error in startCall'));
        }
    });
};

export const acceptCall = (session: Session): Promise<Session> => {
    return new Promise((resolve, reject) => {
        try {
            const QB = ensureQB();
            
            if (!session) {
                reject(new Error('No session provided to accept'));
                return;
            }

            console.log('Accepting call, session type:', session.callType);
            
            const isVideo = session.callType === QB.webrtc.CallType.VIDEO;
            const mediaParams = {
                audio: true,
                video: isVideo,
                options: {
                    muted: false,
                    mirror: true
                }
            };

            console.log('Getting user media for accepting call:', mediaParams);

            session.getUserMedia(mediaParams, (err: any, stream: any) => {
                if (err) {
                    console.error('Failed to get user media for accepting call:', err);
                    let errorMessage = 'Failed to access media devices';
                    
                    if (err.name === 'NotAllowedError') {
                        errorMessage = 'Permission denied. Please allow access to your microphone' + (isVideo ? ' and camera' : '');
                    } else if (err.name === 'NotReadableError') {
                        errorMessage = 'Device is already in use. Please close other applications using your microphone/camera';
                    }
                    
                    reject(new Error(errorMessage));
                    return;
                }

                try {
                    // Pass the stream to the accept method
                    session.accept(null, mediaParams);
                    console.log('Call accepted successfully');
                    resolve(session);
                } catch (acceptErr: any) {
                    console.error('Failed to accept call:', acceptErr);
                    // Cleanup stream on error
                    if (stream && stream.getTracks) {
                        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
                    }
                    reject(new Error('Failed to accept call: ' + (acceptErr.message || acceptErr)));
                }
            });

        } catch (error: any) {
            console.error('Error in acceptCall:', error);
            reject(new Error(error.message || 'Unknown error in acceptCall'));
        }
    });
};

export const stopCall = (session: Session) => {
    try {
        if (!session) {
            console.warn('No session to stop');
            return;
        }
        
        console.log('Stopping call...');
        
        // Stop session
        session.stop({});
        console.log('Call stopped successfully');
        
    } catch (error) {
        console.error('Error stopping call:', error);
    }
};

export const rejectCall = (session: Session) => {
    try {
        if (!session) {
            console.warn('No session to reject');
            return;
        }
        
        console.log('Rejecting call...');
        session.reject({});
        console.log('Call rejected successfully');
        
    } catch (error) {
        console.error('Error rejecting call:', error);
    }
};

export const attachStreamHandlers = (
    setLocal: (stream: MediaStream) => void, 
    setRemote: (stream: MediaStream) => void
) => {
    try {
        const QB = ensureQB();
        
        console.log('Attaching stream handlers...');

        // Local stream handler
        QB.webrtc.onLocalStreamListener = function(session: Session, stream: MediaStream) {
            console.log('Local stream received:', stream);
            try {
                if (stream && setLocal) {
                    setLocal(stream);
                }
            } catch (error) {
                console.error('Error handling local stream:', error);
            }
        };

        // Remote stream handler
        QB.webrtc.onRemoteStreamListener = function(session: Session, userId: number, stream: MediaStream) {
            console.log('Remote stream received from user:', userId, stream);
            try {
                if (stream && setRemote) {
                    setRemote(stream);
                }
            } catch (error) {
                console.error('Error handling remote stream:', error);
            }
        };

        console.log('Stream handlers attached successfully');

    } catch (error) {
        console.error('Error attaching stream handlers:', error);
    }
};

// Utility function to check if WebRTC is supported
export const isWebRTCSupported = (): boolean => {
    try {
        return !!(
            navigator.mediaDevices && 
            navigator.mediaDevices.getUserMedia && 
            window.RTCPeerConnection
        );
    } catch {
        return false;
    }
};

// Media permission checker
export const checkMediaPermissions = async (video: boolean = false): Promise<boolean> => {
    try {
        console.log('Checking media permissions for:', video ? 'audio+video' : 'audio only');
        
        const constraints = { 
            audio: true, 
            video: video 
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        console.log('Media permission granted, stream obtained:', stream);
        
        // Stop all tracks immediately
        stream.getTracks().forEach(track => {
            track.stop();
            console.log('Stopped track:', track.kind);
        });
        
        // Small delay to ensure proper cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return true;
        
    } catch (error: any) {
        console.error('Media permission check failed:', error);
        return false;
    }
};