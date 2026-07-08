import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, Clock, User, Download, AlertCircle } from 'lucide-react';
import { getSessionId, fetchRecentLogs, type ApexLogRecord } from '../api/salesforce';
import '../index.css';

const Popup = () => {
  const [logs, setLogs] = useState<ApexLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [salesforceDomain, setSalesforceDomain] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // In a real extension, we query the active tab's domain
        // For development/mocking, we can hardcode or mock
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            const url = new URL(tabs[0].url || '');
            const domain = url.origin;
            
            if (!domain.includes('salesforce.com') && !domain.includes('force.com') && !domain.includes('salesforce-setup.com')) {
              setError("Please open a Salesforce tab to view logs.");
              setLoading(false);
              return;
            }

            setSalesforceDomain(domain);

            const sid = await getSessionId(domain);
            if (!sid) {
              setError("Session ID not found. Are you logged in?");
              setLoading(false);
              return;
            }

            const recentLogs = await fetchRecentLogs(domain, sid);
            setLogs(recentLogs);
            setLoading(false);
          });
        } else {
          // Mock data for local testing outside extension environment
          setTimeout(() => {
            setLogs([
              { Id: '1', Status: 'Success', StartTime: new Date().toISOString(), LogLength: 2048576, Operation: 'ApexREST', LogUser: { Name: 'John Doe' } },
              { Id: '2', Status: 'Success', StartTime: new Date().toISOString(), LogLength: 8576, Operation: 'Flow', LogUser: { Name: 'Jane Smith' } },
            ]);
            setLoading(false);
          }, 1000);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load logs');
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const formatSize = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const filteredLogs = logs.filter(log => 
    log.Operation.toLowerCase().includes(search.toLowerCase()) ||
    (log.LogUser?.Name || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAnalyze = (logId: string) => {
    const domain = salesforceDomain ?? window.location.origin;

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        action: 'openAppTab',
        logId: logId,
        domain: domain
      });
    } else {
      console.log('Opening App Tab for Log:', logId);
    }
  };

  return (
    <div className="w-[400px] h-[500px] flex flex-col bg-zinc-950 text-zinc-200 border-zinc-800 font-sans">
      
      {/* Header / Search */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Search logs by user or operation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            <span className="animate-pulse">Fetching logs from Salesforce...</span>
          </div>
        )}
        
        {error && (
          <div className="flex flex-col items-center justify-center h-full text-red-400 text-sm p-4 text-center space-y-2">
            <AlertCircle className="h-8 w-8" />
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && filteredLogs.map((log) => (
          <div key={log.Id} className="group flex items-center justify-between p-3 hover:bg-zinc-800/50 rounded-md transition-colors border border-transparent hover:border-zinc-700/50 cursor-pointer">
            <div className="flex flex-col gap-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-200 truncate">{log.Operation}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                  {formatSize(log.LogLength)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {formatTime(log.StartTime)}</span>
                <span className="flex items-center gap-1"><User className="w-3 h-3"/> {log.LogUser?.Name || 'System'}</span>
              </div>
            </div>
            <button 
              onClick={() => handleAnalyze(log.Id)}
              className="opacity-0 group-hover:opacity-100 bg-blue-600 hover:bg-blue-500 text-white p-1.5 rounded-md transition-all">
              <Download className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<Popup />);
