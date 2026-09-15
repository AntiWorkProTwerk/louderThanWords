import React from 'react';
import { PublicMeeting } from '../../types/civic';
import { Calendar, Clock, MapPin, Video, FileText, MessageSquare, ExternalLink, Download } from 'lucide-react';

interface PublicMeetingsCardProps {
  meeting: PublicMeeting;
}

export const PublicMeetingsCard: React.FC<PublicMeetingsCardProps> = ({ meeting }) => {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all duration-200">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-2.5 py-0.5 rounded">
          {meeting.meetingType}
        </span>
        {meeting.isVirtual && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 rounded-full font-medium">
            <Video className="w-3 h-3" />
            Live Stream Available
          </span>
        )}
      </div>

      <h4 className="text-base font-bold text-white mb-2">{meeting.bodyName}</h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300 mb-3.5 bg-slate-950/50 p-3 rounded-lg border border-slate-800/70">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <span>{meeting.date}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <span>{meeting.time}</span>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <MapPin className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <span className="truncate">{meeting.location}</span>
        </div>
      </div>

      {/* Agenda Highlights */}
      {meeting.agendaHighlights.length > 0 && (
        <div className="mb-3.5">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Scheduled Agenda Highlights:
          </div>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {meeting.agendaHighlights.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Public Comment instructions */}
      <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50 mb-3.5 text-xs text-slate-300">
        <div className="font-semibold text-slate-200 flex items-center gap-1.5 mb-1">
          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
          Public Comment & Participation Rules:
        </div>
        <p className="text-slate-400">{meeting.publicCommentProcedure}</p>
      </div>

      {/* Action Links */}
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800 text-xs">
        {meeting.agendaUrl && (
          <a
            href={meeting.agendaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            Download Agenda PDF
          </a>
        )}

        {meeting.streamUrl && (
          <a
            href={meeting.streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 px-3 py-1.5 rounded-lg border border-indigo-500/30 font-medium transition-colors"
          >
            <Video className="w-3.5 h-3.5" />
            Watch Live Stream
            <ExternalLink className="w-3 h-3" />
          </a>
        )}

        {meeting.minutesUrl && (
          <a
            href={meeting.minutesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 ml-auto transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Past Minutes Archive
          </a>
        )}
      </div>
    </div>
  );
};
