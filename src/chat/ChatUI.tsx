import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ChatDialog, 
    ChatMessage, 
    listDialogs, 
    listMessages, 
    sendMessage, 
    subscribeOnMessages, 
    joinIfNeeded, 
    searchUsers, 
    createPrivateDialog, 
    createGroupDialog, 
    UserItem
} from './chat.service';
import {
    acceptCall, 
    initWebRTC, 
    startCall, 
    stopCall, 
    attachStreamHandlers, 
    rejectCall,
    isWebRTCSupported,
    checkMediaPermissions
} from './webrtc.service';

type Props = {
    onLogout: () => void;
    currentUserId: number;
};

const ChatUI: React.FC<Props> = ({ onLogout, currentUserId }) => {
    const [dialogs, setDialogs] = useState<ChatDialog[]>([]);
    const [activeDialogId, setActiveDialogId] = useState<string>('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [showCreateModal, setShowCreateModal] = useState<null | 'chooser' | 'private' | 'group'>(null);
    const [userQuery, setUserQuery] = useState('');
    const [users, setUsers] = useState<UserItem[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [groupName, setGroupName] = useState('');
    const [groupStep, setGroupStep] = useState<'select' | 'name'>('select');
    
    // Call-related states
    const [isCallInProgress, setIsCallInProgress] = useState(false);
    const [isIncomingCall, setIsIncomingCall] = useState(false);
    const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
    const [callError, setCallError] = useState<string>('');
    
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    // ADDED: Ref for the remote audio element
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

    const sessionRef = useRef<any>(null);
    const messagesRef = useRef<HTMLDivElement | null>(null);

    // Cleanup media streams
    const cleanupMediaStreams = () => {
        console.log('Cleaning up media streams...');
        
        // Clear local video
        if (localVideoRef.current && localVideoRef.current.srcObject) {
            const stream = localVideoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => {
                track.stop();
                console.log('Stopped local track:', track.kind);
            });
            localVideoRef.current.srcObject = null;
        }
        
        // Clear remote video
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
            const stream = remoteVideoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => {
                track.stop();
                console.log('Stopped remote track:', track.kind);
            });
            remoteVideoRef.current.srcObject = null;
        }

        // ADDED: Clear remote audio
        if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
            remoteAudioRef.current.srcObject = null;
        }

        // Clear session streams
        if (sessionRef.current && sessionRef.current.localStream) {
            sessionRef.current.localStream.getTracks().forEach((track: MediaStreamTrack) => {
                track.stop();
                console.log('Stopped session track:', track.kind);
            });
            sessionRef.current.localStream = null;
        }
    };

    const handleCallEnd = () => {
        console.log('Cleaning up call state...');
        setIsCallInProgress(false);
        setIsIncomingCall(false);
        setCallType(null);
        setCallError('');
        sessionRef.current = null;
        cleanupMediaStreams();
    };

    useEffect(() => {
        const initializeApp = async () => {
            try {
                console.log('Initializing app...');

                // Check WebRTC support
                if (!isWebRTCSupported()) {
                    console.warn('WebRTC not supported in this browser');
                    setCallError('WebRTC not supported in this browser');
                }

                // Load dialogs
                const dialogsList = await listDialogs();
                setDialogs(dialogsList);
                console.log('Dialogs loaded:', dialogsList.length);

                // Initialize WebRTC
                initWebRTC({
                    onIncoming: (session, extension) => {
                        console.log('Incoming call - setting up UI', session);
                        sessionRef.current = session;
                        setIsIncomingCall(true);
                        
                        const QB = (window as any).QB;
                        const isVideoCall = session.callType === QB.webrtc.CallType.VIDEO;
                        setCallType(isVideoCall ? 'video' : 'audio');
                        setCallError('');
                    },
                    onCall: (session, extension) => {
                        console.log('Call established successfully');
                        setIsCallInProgress(true);
                        setIsIncomingCall(false);
                        setCallError('');
                    },
                    onStop: (session) => {
                        console.log('Call ended by system');
                        handleCallEnd();
                    },
                    onReject: (session, userId, extension) => {
                        console.log('Call rejected by user:', userId);
                        handleCallEnd();
                    }
                });

                console.log('App initialized successfully');

            } catch (error) {
                console.error('Failed to initialize app:', error);
                setCallError('Failed to initialize call system');
            }
        };

        initializeApp();
    }, []);

    useEffect(() => {
        if (showCreateModal === 'private' || showCreateModal === 'group') {
            searchUsers(userQuery).then(setUsers).catch(console.error);
        }
    }, [showCreateModal, userQuery]);

    useEffect(() => {
        if (!activeDialogId) return;
        const dialog = dialogs.find(d => d._id === activeDialogId);
        if (dialog) joinIfNeeded(dialog).catch(console.error);
        listMessages(activeDialogId).then(setMessages).catch(console.error);
    }, [activeDialogId, dialogs]);

    useEffect(() => {
        subscribeOnMessages((m) => {
            if (m.chat_dialog_id === activeDialogId) {
                setMessages((prev) => [...prev, m]);
            }
        });
    }, [activeDialogId]);

    const activeDialog = useMemo(() => dialogs.find(d => d._id === activeDialogId), [dialogs, activeDialogId]);

    useEffect(() => {
        if (messagesRef.current) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || !activeDialogId) return;
        
        const optimistic: ChatMessage = { 
            message: text, 
            sender_id: currentUserId, 
            chat_dialog_id: activeDialogId, 
            date_sent: Date.now() / 1000 
        };
        setMessages(prev => [...prev, optimistic]);
        
        try {
            await sendMessage(activeDialogId, text);
        } catch (error) {
            console.error('Failed to send message:', error);
        }
        setInput('');
    };

    const handleAudioCall = async () => {
        if (!activeDialog) {
            alert('No active dialog selected');
            return;
        }

        try {
            console.log('Starting audio call...');
            setCallError('');
            
            const opponentIds = (activeDialog.occupants_ids || [])
                .filter(id => id && Number(id) !== Number(currentUserId))
                .map(id => Number(id));
            
            if (!opponentIds.length) {
                alert('No other participants found in this dialog');
                return;
            }

            console.log('Audio call opponents:', opponentIds);

            // Cleanup any existing call
            if (sessionRef.current) {
                console.log('Stopping existing call...');
                stopCall(sessionRef.current);
                handleCallEnd();
            }
            
            // Check permissions first
            const hasPermission = await checkMediaPermissions(false);
            if (!hasPermission) {
                setCallError('Microphone permission required');
                alert('Please allow microphone access to make audio calls');
                return;
            }

            setIsCallInProgress(true);
            setCallType('audio');

            // ADDED: Attach stream handlers right before the call starts
            attachStreamHandlers(
                (localStream: MediaStream) => {
                    console.log('Local audio stream received.');
                    // You don't need to display your own audio stream in a UI element
                },
                (remoteStream: MediaStream) => {
                    console.log('Remote audio stream received. Playing now.');
                    if (remoteAudioRef.current) {
                        remoteAudioRef.current.srcObject = remoteStream;
                        remoteAudioRef.current.play().catch(e =>
                            console.warn('Remote audio play failed:', e)
                        );
                    }
                }
            );

            const session = await startCall(opponentIds, false);
            sessionRef.current = session;
            
            console.log('Audio call started successfully');

        } catch (error: any) {
            console.error('Audio call failed:', error);
            const message = error.message || 'Failed to start audio call';
            setCallError(message);
            setIsCallInProgress(false);
            setCallType(null);
            cleanupMediaStreams();
            alert(message);
        }
    };

    const handleVideoCall = async () => {
        if (!activeDialog) {
            alert('No active dialog selected');
            return;
        }

        try {
            console.log('Starting video call...');
            setCallError('');
            
            const opponentIds = (activeDialog.occupants_ids || [])
                .filter(id => id && Number(id) !== Number(currentUserId))
                .map(id => Number(id));
            
            if (!opponentIds.length) {
                alert('No other participants found in this dialog');
                return;
            }

            console.log('Video call opponents:', opponentIds);

            // Cleanup any existing call
            if (sessionRef.current) {
                console.log('Stopping existing call...');
                stopCall(sessionRef.current);
                handleCallEnd();
            }
            
            // Check permissions first
            const hasPermission = await checkMediaPermissions(true);
            if (!hasPermission) {
                setCallError('Camera and microphone permission required');
                alert('Please allow camera and microphone access to make video calls');
                return;
            }

            setIsCallInProgress(true);
            setCallType('video');

            // ADDED: Attach stream handlers for video call
            attachStreamHandlers(
                (localStream: MediaStream) => {
                    console.log('Setting local stream to video element');
                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = localStream;
                        localVideoRef.current.play().catch(e => 
                            console.warn('Local video play failed:', e)
                        );
                    }
                },
                (remoteStream: MediaStream) => {
                    console.log('Setting remote stream to video element');
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = remoteStream;
                        remoteVideoRef.current.play().catch(e => 
                            console.warn('Remote video play failed:', e)
                        );
                    }
                }
            );

            const session = await startCall(opponentIds, true);
            sessionRef.current = session;
            
            console.log('Video call started successfully');

        } catch (error: any) {
            console.error('Video call failed:', error);
            const message = error.message || 'Failed to start video call';
            setCallError(message);
            setIsCallInProgress(false);
            setCallType(null);
            cleanupMediaStreams();
            alert(message);
        }
    };

    const handleAcceptCall = async () => {
        if (!sessionRef.current) {
            console.warn('No session to accept');
            return;
        }

        try {
            console.log('Accepting incoming call...');
            setCallError('');

            // ADDED: Attach stream handlers when accepting a call
            attachStreamHandlers(
                (localStream: MediaStream) => {
                    if (callType === 'video' && localVideoRef.current) {
                        localVideoRef.current.srcObject = localStream;
                        localVideoRef.current.play().catch(e => console.warn('Local video play failed:', e));
                    }
                },
                (remoteStream: MediaStream) => {
                    if (callType === 'video' && remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = remoteStream;
                        remoteVideoRef.current.play().catch(e => console.warn('Remote video play failed:', e));
                    } else if (callType === 'audio' && remoteAudioRef.current) {
                        remoteAudioRef.current.srcObject = remoteStream;
                        remoteAudioRef.current.play().catch(e => console.warn('Remote audio play failed:', e));
                    }
                }
            );
            
            await acceptCall(sessionRef.current);
            
            setIsIncomingCall(false);
            setIsCallInProgress(true);
            console.log('Call accepted successfully');
            
        } catch (error: any) {
            console.error('Failed to accept call:', error);
            const message = error.message || 'Failed to accept call';
            setCallError(message);
            alert(message);
            handleCallEnd();
        }
    };

    const handleRejectCall = () => {
        if (!sessionRef.current) return;
        
        try {
            console.log('Rejecting incoming call...');
            rejectCall(sessionRef.current);
            handleCallEnd();
        } catch (error) {
            console.error('Failed to reject call:', error);
        }
    };

    const handleEndCall = () => {
        if (!sessionRef.current) return;
        
        try {
            console.log('Ending active call...');
            stopCall(sessionRef.current);
            handleCallEnd();
        } catch (error) {
            console.error('Failed to end call:', error);
        }
    };
    
    // Use an effect to automatically stop call and cleanup if the dialog changes
    useEffect(() => {
        if (sessionRef.current) {
            console.log('Active dialog changed, ending current call.');
            handleEndCall();
        }
    }, [activeDialogId]);

    return (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - 64px)' }}>
                <aside style={{ borderRight: '1px solid #ddd', overflow: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', fontWeight: 600 }}>
                        <span style={{ flex: 1 }}>Dialogs</span>
                        <button title="Search" disabled style={{ marginRight: 8 }}>🔍</button>
                        <button title="New dialog" onClick={() => setShowCreateModal('chooser')}>➕</button>
                    </div>
                    {dialogs.map(d => (
                        <div
                            key={d._id}
                            onClick={() => setActiveDialogId(d._id)}
                            style={{
                                padding: '12px 16px',
                                cursor: 'pointer',
                                background: activeDialogId === d._id ? '#eef3ff' : 'transparent'
                            }}
                        >
                            <div style={{ fontWeight: 600 }}>{d.name || 'Untitled'}</div>
                            <div style={{ fontSize: 12, color: '#666' }}>{d.last_message || ''}</div>
                        </div>
                    ))}
                </aside>

                <section style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 0, height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #ddd' }}>
                        <div style={{ fontWeight: 700 }}>{activeDialog?.name || 'Select a dialog'}</div>
                        {activeDialog && (
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                                {callError && (
                                    <div style={{ color: 'red', fontSize: 12, maxWidth: 200 }}>
                                        {callError}
                                    </div>
                                )}
                                
                                {isIncomingCall && (
                                    <>
                                        <div style={{ color: 'green', fontWeight: 'bold' }}>
                                            Incoming {callType} call...
                                        </div>
                                        <button 
                                            onClick={handleAcceptCall} 
                                            style={{ 
                                                background: 'green', 
                                                color: 'white', 
                                                padding: '5px 10px', 
                                                border: 'none', 
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Accept
                                        </button>
                                        <button 
                                            onClick={handleRejectCall} 
                                            style={{ 
                                                background: 'red', 
                                                color: 'white', 
                                                padding: '5px 10px', 
                                                border: 'none', 
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Reject
                                        </button>
                                    </>
                                )}
                                
                                {!isIncomingCall && (
                                    <>
                                        <button 
                                            onClick={handleAudioCall}
                                            disabled={isCallInProgress}
                                            style={{ 
                                                opacity: isCallInProgress ? 0.5 : 1, 
                                                padding: '5px 10px', 
                                                border: '1px solid #ddd', 
                                                borderRadius: '4px', 
                                                background: isCallInProgress && callType === 'audio' ? '#e7f1ff' : '#fff',
                                                cursor: isCallInProgress ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            {isCallInProgress && callType === 'audio' ? 'Audio Active' : '🎤 Audio'}
                                        </button>
                                        <button 
                                            onClick={handleVideoCall}
                                            disabled={isCallInProgress}
                                            style={{ 
                                                opacity: isCallInProgress ? 0.5 : 1, 
                                                padding: '5px 10px', 
                                                border: '1px solid #ddd', 
                                                borderRadius: '4px', 
                                                background: isCallInProgress && callType === 'video' ? '#e7f1ff' : '#fff',
                                                cursor: isCallInProgress ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            {isCallInProgress && callType === 'video' ? 'Video Active' : '🎥 Video'}
                                        </button>
                                    </>
                                )}
                                
                                {isCallInProgress && (
                                    <button 
                                        onClick={handleEndCall} 
                                        style={{ 
                                            background: 'red', 
                                            color: 'white', 
                                            padding: '5px 10px', 
                                            border: 'none', 
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        End Call
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div ref={messagesRef} style={{ overflowY: 'auto', padding: '12px', minHeight: 0, height: '100%' }}>
                        {messages.map((m, idx) => {
                            const isOwn = Number(m.sender_id) === Number(currentUserId);
                            return (
                                <div key={(m._id || idx) + ''} style={{ margin: '8px 0', display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                                    <div style={{
                                        display: 'inline-block',
                                        background: isOwn ? '#e7f1ff' : '#f1f3f5',
                                        color: '#111',
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        maxWidth: '70%'
                                    }}>
                                        {m.message}
                                    </div>
                                </div>
                            );
                        })}
                        
                        {/* Video elements */}
                        {isCallInProgress && callType === 'video' && (
                            <div style={{ 
                                marginTop: '20px', 
                                padding: '10px', 
                                background: '#f8f9fa', 
                                borderRadius: '8px' 
                            }}>
                                <div style={{ 
                                    display: 'flex', 
                                    gap: '15px', 
                                    justifyContent: 'center', 
                                    flexWrap: 'wrap' 
                                }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ 
                                            marginBottom: '8px', 
                                            fontSize: '14px', 
                                            fontWeight: 'bold' 
                                        }}>
                                            Your Video
                                        </div>
                                        <video 
                                            ref={localVideoRef} 
                                            autoPlay 
                                            muted 
                                            playsInline 
                                            style={{ 
                                                width: '250px', 
                                                height: '180px', 
                                                background: '#000', 
                                                borderRadius: '8px',
                                                objectFit: 'cover'
                                            }}
                                        />
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ 
                                            marginBottom: '8px', 
                                            fontSize: '14px', 
                                            fontWeight: 'bold' 
                                        }}>
                                            Remote Video
                                        </div>
                                        <video 
                                            ref={remoteVideoRef} 
                                            autoPlay 
                                            playsInline 
                                            style={{ 
                                                width: '250px', 
                                                height: '180px', 
                                                background: '#000', 
                                                borderRadius: '8px',
                                                objectFit: 'cover'
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Audio call indicator */}
                        {isCallInProgress && callType === 'audio' && (
                            <div style={{ 
                                marginTop: '20px', 
                                padding: '15px', 
                                background: '#e7f1ff', 
                                borderRadius: '8px', 
                                textAlign: 'center' 
                            }}>
                                <div style={{ 
                                    fontSize: '18px', 
                                    fontWeight: 'bold', 
                                    color: '#0066cc' 
                                }}>
                                    🎤 Audio Call in Progress
                                </div>
                            </div>
                        )}

                        {/* ADDED: Audio element for playing the remote stream */}
                        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
                    </div>

                    <div style={{ display: 'flex', gap: 8, padding: '12px', borderTop: '1px solid #ddd' }}>
                        <input
                            style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Type message"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                        />
                        <button 
                            onClick={handleSend}
                            style={{ 
                                padding: '8px 16px', 
                                background: '#0066cc', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Send
                        </button>
                    </div>
                </section>
            </div>

            {/* Create Dialog Modals */}
            {showCreateModal === 'chooser' && (
                <div style={{ 
                    position: 'fixed', 
                    inset: 0, 
                    background: 'rgba(0,0,0,0.4)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                }}>
                    <div style={{ 
                        background: '#fff', 
                        padding: 16, 
                        width: 520, 
                        borderRadius: 8 
                    }}>
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            marginBottom: 12 
                        }}>
                            <div style={{ fontWeight: 700, fontSize: 20 }}>New dialog</div>
                            <button 
                                onClick={() => setShowCreateModal(null)}
                                style={{ cursor: 'pointer' }}
                            >
                                ✕
                            </button>
                        </div>
                        <div style={{ display: 'grid', gap: 12 }}>
                            <button 
                                style={{ 
                                    padding: 16, 
                                    border: '1px solid #e0e0e0', 
                                    borderRadius: 8, 
                                    textAlign: 'left',
                                    cursor: 'pointer'
                                }} 
                                onClick={() => setShowCreateModal('private')}
                            >
                                🔷 Private
                            </button>
                            <button 
                                style={{ 
                                    padding: 16, 
                                    border: '1px solid #e0e0e0', 
                                    borderRadius: 8, 
                                    textAlign: 'left',
                                    cursor: 'pointer'
                                }} 
                                onClick={() => setShowCreateModal('group')}
                            >
                                👥 Group
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {(showCreateModal === 'private' || showCreateModal === 'group') && (
                <div style={{
                    position:'fixed', 
                    inset:0, 
                    background:'rgba(0,0,0,0.4)', 
                    display:'flex', 
                    alignItems:'center', 
                    justifyContent:'center'
                }}>
                    <div style={{
                        background:'#fff', 
                        padding:16, 
                        width:460, 
                        maxHeight:'80vh', 
                        overflow:'auto', 
                        borderRadius:8
                    }}>
                        {groupStep === 'select' && (
                            <>
                                <div style={{
                                    display:'flex', 
                                    justifyContent:'space-between', 
                                    alignItems:'center', 
                                    marginBottom:12
                                }}>
                                    <div style={{fontWeight:700}}>New dialog</div>
                                    <button 
                                        onClick={() => { 
                                            setShowCreateModal(null); 
                                            setSelectedIds([]); 
                                            setUserQuery(''); 
                                            setGroupName(''); 
                                            setGroupStep('select'); 
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        ✕
                                    </button>
                                </div>
                                <input
                                    style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginBottom: '12px' }}
                                    placeholder="Search users..."
                                    value={userQuery}
                                    onChange={(e) => setUserQuery(e.target.value)}
                                />
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
                                        Users
                                    </div>
                                    <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #ddd', borderRadius: 4, padding: 8 }}>
                                        {users.map(u => (
                                            <div 
                                                key={u.id}
                                                onClick={() => {
                                                    if (showCreateModal === 'private') {
                                                        createPrivateDialog(u.id).then(d => {
                                                            setDialogs(prev => [d, ...prev]);
                                                            setActiveDialogId(d._id);
                                                            setShowCreateModal(null);
                                                            setUserQuery('');
                                                        }).catch(console.error);
                                                    } else if (showCreateModal === 'group') {
                                                        setSelectedIds(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]);
                                                    }
                                                }}
                                                style={{ 
                                                    padding: 8, 
                                                    cursor: 'pointer', 
                                                    borderRadius: 4,
                                                    background: selectedIds.includes(u.id) ? '#eef3ff' : 'transparent',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    border: 'none'
                                                }}
                                            >
                                                <div style={{ flex: 1 }}>
                                                    {u.full_name || u.login}
                                                </div>
                                                {selectedIds.includes(u.id) && '✓'}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {showCreateModal === 'group' && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                        <button onClick={() => setGroupStep('name')} disabled={!selectedIds.length}>Next</button>
                                    </div>
                                )}
                            </>
                        )}
                        {groupStep === 'name' && (
                            <>
                                <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center', 
                                    marginBottom: 12 
                                }}>
                                    <button onClick={() => setGroupStep('select')}>Back</button>
                                    <div style={{ fontWeight: 700 }}>Group name</div>
                                    <button onClick={() => { setShowCreateModal(null); setGroupStep('select'); }}>✕</button>
                                </div>
                                <input
                                    style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginBottom: '12px' }}
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                    placeholder="Group name..."
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                    <button 
                                        disabled={!groupName.trim()} 
                                        onClick={async () => {
                                            try {
                                                const d = await createGroupDialog(groupName.trim(), selectedIds);
                                                setDialogs(prev => [d, ...prev]);
                                                setActiveDialogId(d._id);
                                                setShowCreateModal(null);
                                                setSelectedIds([]);
                                                setGroupName('');
                                                setGroupStep('select');
                                            } catch (e) { console.error(e); }
                                        }}
                                        style={{ 
                                            cursor: groupName.trim() ? 'pointer' : 'not-allowed',
                                            opacity: groupName.trim() ? 1 : 0.5
                                        }}
                                    >
                                        Create
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default ChatUI;