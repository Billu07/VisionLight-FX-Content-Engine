import { useEffect, useState } from "react";
import { apiEndpoints } from "../../../lib/api";
import type { SequenceItem } from "../../../components/FullscreenVideoEditor";

export function useProjectEditorState() {
  const activeProjectId = localStorage.getItem("visionlight_active_project") || "default";

  const sequenceKey = `visionlight_sequence_${activeProjectId}`;
  const [sequence, setSequence] = useState<SequenceItem[]>(() => {
    try {
      const stored = localStorage.getItem(sequenceKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const binKey = `visionlight_bin_${activeProjectId}`;
  const [binItems, setBinItems] = useState<SequenceItem[]>(() => {
    try {
      const stored = localStorage.getItem(binKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const audioTracksKey = `visionlight_audio_${activeProjectId}`;
  const [audioTracks, setAudioTracks] = useState<any[]>(() => {
    try {
      const stored = localStorage.getItem(audioTracksKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(sequenceKey, JSON.stringify(sequence));
  }, [sequence, sequenceKey]);

  useEffect(() => {
    localStorage.setItem(binKey, JSON.stringify(binItems));
  }, [binItems, binKey]);

  useEffect(() => {
    localStorage.setItem(audioTracksKey, JSON.stringify(audioTracks));
  }, [audioTracks, audioTracksKey]);

  useEffect(() => {
    const projectId = localStorage.getItem("visionlight_active_project");
    if (!projectId) return;

    apiEndpoints
      .getProjects()
      .then((res) => {
        const project = res.data.projects?.find((p: any) => p.id === projectId);
        if (project && project.editorState) {
          setSequence(project.editorState.sequence || []);
          setAudioTracks(project.editorState.audioTracks || []);
        }
      })
      .catch((err) => console.error("Failed to fetch project editor state", err));
  }, []);

  return {
    sequence,
    setSequence,
    binItems,
    setBinItems,
    audioTracks,
    setAudioTracks,
  };
}
