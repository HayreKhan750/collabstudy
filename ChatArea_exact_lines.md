# ChatArea.tsx - Exact Line Extracts

## Lines 1280-1360 (Pinned bar render + scroll container)

```tsx
            aria-label="Back to sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-white font-semibold truncate"># {channelName}</h2>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleSummarize}
            className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 flex-shrink-0"
          >
            <span>✨</span>
            <span className="hidden sm:inline">Summarize</span>
          </button>
        )}

        {/* Search bar */}
        <div className="ml-auto flex items-center gap-2 w-64">
          <div className="relative flex-1">
            {/* Search icon */}
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500 pointer-events-none"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
              className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 dark:placeholder-slate-500 rounded-md pl-8 pr-3 py-1.5 border border-slate-200 dark:border-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
            {/* Spinner while fetching */}
            {isSearching && (
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
          </div>
          {/* Clear / close button — only shown when search is active */}
          {isSearchActive && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchError(null); }}
              className="flex-shrink-0 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              title="Clear search"
              aria-label="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Body: chat messages OR search results panel ── */}
      <div className="flex flex-1 overflow-hidden relative">

      {/* Search Results Panel — slides in from the right when search is active */}
      {isSearchActive && (
        <div className="absolute inset-y-0 right-0 w-96 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-white/5 flex flex-col z-30 shadow-2xl">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
            <div>
              <h3 className="text-white text-sm font-semibold">Search results</h3>
              {!isSearching && (
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                  {searchResults.length === 0
                    ? `No results for "${searchQuery}"`
                    : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${searchQuery}"`}
                </p>
```

## Lines 1390-1450 (MessageBubble render, onSelect, isSelected props)

```tsx
              <div className="flex flex-col items-center justify-center h-32 text-slate-400 dark:text-slate-500 text-sm gap-2 px-4 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                No messages matched your search.
                <span className="text-xs text-slate-400 dark:text-slate-500">Try a different keyword.</span>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {searchResults.map((result) => {
                  const displayName = result.user.fullName || result.user.username;
                  const initial = displayName.charAt(0).toUpperCase();
                  return (
                    <li
                      key={result.id}
                      className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => jumpToMessage(result.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') jumpToMessage(result.id); }}
                    >
                      {/* Channel badge */}
                      <p className="text-xs text-blue-400 font-medium mb-1.5">
                        # {result.channelName}
                      </p>
                      {/* Sender + timestamp */}
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                          {initial}
                        </div>
                        <span className="text-white text-xs font-semibold">{displayName}</span>
                        <span className="text-slate-400 dark:text-slate-500 text-xs ml-auto" title={new Date(result.createdAt).toLocaleString()}>
                          {formatRelativeTime(result.createdAt)}
                        </span>
                      </div>
                      {/* Message content with keyword highlight */}
                      <p className="text-slate-600 dark:text-slate-300 text-sm leading-snug break-words pl-8">
                        {highlightText(result.content, searchQuery.trim())}
                      </p>
                      {/* Similarity score badge */}
                      <div className="pl-8 mt-1">
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {Math.round(result.similarity * 100)}% match
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      {/* Pinned message bar */}
      {pinnedMessage && showPinnedBar && (
        <PinnedMessageBar
          content={pinnedMessage.content ?? '[attachment]'}
          onClick={() => {
            const el = document.getElementById(`msg-${pinnedMessage.id}`);
```

## Lines 1540-1620 (Bulk action bar + input section)

```tsx
                  onFindSimilar={message.content ? () => setRelatedSource(message) : undefined}
                  onCopy={message.content ? () => handleCopyMessage(message.content!) : undefined}
                  onForward={message.content ? () => setForwardMessage(message) : undefined}
                  onPin={() => {
                    handlePinMessage(message.id);
                    setPinnedMessage((prev) => prev?.id === message.id ? null : message);
                    setShowPinnedBar(true);
                  }}
                  onSelect={() => handleSelectMessage(message.id)}
                  isSelected={selectedMessageIds.has(message.id)}
                />
              </div>
            );
          })
        )}
        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

        {/* Scroll-to-bottom FAB */}
        <ScrollToBottomFAB
          show={showScrollFab}
          unreadCount={fabUnreadCount}
          onScrollToUnread={() => {
            if (unreadDividerRef.current) {
              unreadDividerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
              fabScrolledPastDividerRef.current = true;
              setFabUnreadCount(0);
            } else {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              fabScrolledPastDividerRef.current = false;
            }
          }}
          onScrollToBottom={() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            fabScrolledPastDividerRef.current = false;
            setFabUnreadCount(0);
          }}
        />
      </div>{/* end flex body row */}

      {/* Typing indicator */}
      <div className="flex-shrink-0 min-h-[1.75rem]">
        <TypingIndicator typingUsers={typingUsers} />
      </div>

      {/* Bulk Selection Action Bar */}
      {isSelectionMode && (
        <div className="flex-shrink-0 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">{selectedMessageIds.size} selected</span>
          <button
            onClick={() => {
              const firstId = Array.from(selectedMessageIds)[0];
              const msg = messages.find(m => m.id === firstId);
              if (msg) { setForwardMessage(msg); handleCancelSelection(); }
            }}
            disabled={selectedMessageIds.size === 0}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >Forward</button>
          <button
            onClick={handleDeleteSelected}
            disabled={selectedMessageIds.size === 0}
            className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >Delete</button>
          <button onClick={handleCancelSelection} className="ml-auto px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Cancel</button>
        </div>
      )}

      {/* Input */}
      {!isSelectionMode && (
      <div className="flex-shrink-0 px-4 pb-4">
        {sendError && <p className="text-red-400 text-xs mb-1">{sendError}</p>}
        {reactionError && <p className="text-red-400 text-xs mb-1">{reactionError}</p>}
        {uploadError && <p className="text-red-400 text-xs mb-1">{uploadError}</p>}

        {/* Pending file preview */}
        {pendingFile && (
          <div className="mb-2 flex items-center gap-3 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm">
            {pendingFile.type.startsWith('image/') ? (
              <img src={pendingFile.url} alt={pendingFile.name} className="h-20 w-auto object-contain rounded-md flex-shrink-0" />
            ) : (
```
