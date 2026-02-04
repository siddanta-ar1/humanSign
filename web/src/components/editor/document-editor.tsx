"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { VerificationModal } from "@/components/verification/verification-modal";

import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Quote,
  Code,
  Sparkles,
  FileDown,
  Printer,
  PaintRoller,
  Minus,
  Plus,
  ChevronDown,
  Highlighter,
  Link2,
  MessageSquarePlus,
  Image,
  IndentDecrease,
  IndentIncrease,
  Star,
  Cloud,
  MessageSquare,
  Video,
  Lock,
  Menu,
  FilePlus,
  Download,
  ExternalLink,
  Printer as PrinterIcon,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function DocumentEditor() {
  const [suggestion, setSuggestion] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [headings, setHeadings] = useState<
    { level: number; text: string; pos: number }[]
  >([]);
  const [zoom, setZoom] = useState(100);
  const [contextText, setContextText] = useState(""); // Text for AI context

  // Auth & Session State - use lazy initialization to avoid effect warning
  const [sessionId] = useState<string>(() => {
    const newId = crypto.randomUUID();
    console.log("Session ID initialized:", newId);
    return newId;
  });
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Track if initial session message was sent
  const sessionInitRef = useRef(false);

  useEffect(() => {
    if (!sessionInitRef.current) {
      sessionInitRef.current = true;
      // Session is ready for tracking
    }
  }, [sessionId]);

  // Effect to fetch suggestion when user stops typing
  useEffect(() => {
    if (!contextText || contextText.length < 10) return;

    const timer = setTimeout(async () => {
      if (suggestion) return; // Don't fetch if one exists

      try {
        // Get last 500 chars as context
        const context = contextText.slice(-500);
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context }),
        });
        const data = await res.json();
        if (data.content) {
          setSuggestion(data.content);
          toast.success("AI Suggestion Ready");
        }
      } catch (err) {
        console.error("AI Fetch Error", err);
      }
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timer);
  }, [contextText, suggestion]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: "Start typing your document here...",
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none focus:outline-none min-h-[900px]",
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      setContextText(text); // Update context for effect

      setWordCount(text.split(/\s+/).filter((w) => w.length > 0).length);
      setCharCount(text.length);

      // Extract headings for Outline
      const newHeadings: { level: number; text: string; pos: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          newHeadings.push({
            level: node.attrs.level,
            text: node.textContent,
            pos: pos,
          });
        }
      });
      setHeadings(newHeadings);

      // Clear suggestion if user types
      if (suggestion) setSuggestion("");
    },
    content: `
            <h1>Untitled Document</h1>
            <p>Start writing your content here. The HumanSign extension will track your typing patterns to verify authenticity.</p>
        `,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" && suggestion) {
      e.preventDefault();

      // 1. Insert content via Tiptap
      editor?.commands.insertContent(suggestion + " ");

      // 2. IMPORTANT: Dispatch Message for KeystrokeTracker (Content Script)
      // postMessage is reliable across the Main World (Page) / Isolated World (Extension) boundary
      setTimeout(() => {
        window.postMessage(
          {
            type: "humanSign:aiInsert",
            text: suggestion,
          },
          "*",
        );
      }, 10);

      setSuggestion("");
      toast.info("AI suggestion inserted");
    }
  };

  const scrollToHeading = (pos: number) => {
    editor?.commands.setTextSelection(pos);
    const dom = editor?.view.domAtPos(pos).node as HTMLElement;
    dom?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleNotImplemented = (feature: string) => {
    toast("Functionality Simulated", {
      description: `${feature} would activate here.`,
    });
  };

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen bg-[#F9FBFD] w-full overflow-hidden font-sans text-sm"
      onKeyDown={handleKeyDown}
    >
      {/* Top Header - Logo & Title & Menus */}
      <div className="flex items-center px-4 py-2 gap-4 bg-white shrink-0 z-30 relative shadow-sm border-b border-gray-100">
        <div className="h-10 w-10 bg-[#4285F4] rounded flex items-center justify-center text-white shrink-0 shadow-sm cursor-pointer hover:bg-blue-600 transition-colors">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
          </svg>
        </div>
        <div className="flex flex-col gap-0.5 w-full">
          <div className="flex items-center gap-2">
            <input
              type="text"
              defaultValue="Untitled document"
              className="text-lg font-medium text-slate-700 px-1.5 -ml-1.5 rounded hover:border hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-64 bg-transparent border border-transparent transition-colors truncate"
            />
            <div className="flex items-center gap-1 text-slate-500">
              <Star className="w-4 h-4 hover:text-yellow-400 cursor-pointer transition-colors" />
              <Cloud className="w-4 h-4 ml-1 cursor-pointer" />
            </div>
          </div>
          {/* Menu Bar */}
          <div className="flex items-center gap-1 text-[13px] text-slate-600 select-none">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="px-2 py-0.5 rounded hover:bg-slate-100 transition-colors data-[state=open]:bg-slate-100">
                  File
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem
                  onClick={() => {
                    editor?.commands.setContent("");
                    toast.success("New document created");
                  }}
                >
                  <FilePlus className="mr-2 h-4 w-4" />
                  <span>New document</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsExportOpen(true)}>
                  <ShieldCheck className="mr-2 h-4 w-4 text-blue-600" />
                  <span>Export Verified</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    const blob = new Blob([editor?.getText() || ""], {
                      type: "text/plain",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "document.txt";
                    a.click();
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  <span>Download as Text</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}>
                  <PrinterIcon className="mr-2 h-4 w-4" />
                  <span>Print</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <Link href="/">
                  <DropdownMenuItem>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    <span>Exit to Home</span>
                  </DropdownMenuItem>
                </Link>
              </DropdownMenuContent>
            </DropdownMenu>
            {[
              "Edit",
              "View",
              "Insert",
              "Format",
              "Tools",
              "Extensions",
              "Help",
            ].map((item) => (
              <button
                key={item}
                className="px-2 py-0.5 rounded hover:bg-slate-100 transition-colors"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        {/* Right Header Actions */}
        <div className="ml-auto flex items-center gap-4 shrink-0">
          <div className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors">
            <MessageSquare className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors">
              <Video className="w-6 h-6 text-slate-600" />
            </div>
            <Button className="h-9 px-6 rounded-full bg-[#C2E7FF] hover:bg-[#b3d7ef] text-[#001d35] font-semibold gap-2 border-none shadow-none">
              <Lock className="w-4 h-4" />
              <span>Share</span>
            </Button>
          </div>
          <div className="h-9 w-9 bg-purple-600 text-white rounded-full flex items-center justify-center font-medium cursor-pointer ring-2 ring-white ring-offset-1">
            M
          </div>
        </div>
      </div>

      {/* Toolbar - Standard Bar Style */}
      <div className="w-full px-4 py-1 bg-[#EDF2FA] border-b border-gray-300 flex items-center gap-1.5 overflow-x-auto shrink-0 z-20">
        <div className="flex items-center gap-0.5 shrink-0">
          <ToolbarBtn
            icon={Undo}
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            tooltip="Undo"
          />
          <ToolbarBtn
            icon={Redo}
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            tooltip="Redo"
          />
          <ToolbarBtn
            icon={Printer}
            onClick={() => window.print()}
            tooltip="Print"
          />
          <ToolbarBtn
            icon={PaintRoller}
            onClick={() => handleNotImplemented("Paint format")}
            tooltip="Paint format"
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 px-1 hover:bg-slate-200 rounded cursor-pointer h-7 border border-transparent hover:border-slate-300 focus:outline-none transition-colors ml-1">
                <span className="text-slate-600 font-medium min-w-[3ch] text-right">
                  {zoom}%
                </span>
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[4rem]">
              {[50, 75, 90, 100, 125, 150, 200].map((z) => (
                <DropdownMenuItem key={z} onClick={() => setZoom(z)}>
                  {z}%
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Divider />

        <div className="flex items-center gap-0.5 shrink-0">
          <div className="flex items-center justify-between px-2 w-28 h-7 hover:bg-slate-200 rounded cursor-pointer border border-transparent hover:border-slate-300">
            <span className="text-slate-700 truncate">Normal text</span>
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </div>
          <Divider />
          <div className="flex items-center justify-between px-2 w-24 h-7 hover:bg-slate-200 rounded cursor-pointer border border-transparent hover:border-slate-300">
            <span className="text-slate-700 truncate">Arial</span>
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </div>
          <Divider />
          <div className="flex items-center gap-1">
            <ToolbarBtn
              icon={Minus}
              size="xs"
              onClick={() => handleNotImplemented("Decrease Font")}
            />
            <div className="w-8 text-center border px-1 h-6 flex items-center justify-center rounded bg-white text-slate-700 border-slate-300 hover:border-blue-500 focus-within:border-blue-500">
              11
            </div>
            <ToolbarBtn
              icon={Plus}
              size="xs"
              onClick={() => handleNotImplemented("Increase Font")}
            />
          </div>
        </div>

        <Divider />

        <div className="flex items-center gap-0.5 shrink-0">
          <ToolbarBtn
            icon={Bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            tooltip="Bold"
          />
          <ToolbarBtn
            icon={Italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            tooltip="Italic"
          />
          <ToolbarBtn
            icon={UnderlineIcon}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")}
            tooltip="Underline"
          />
          <div className="flex flex-col items-center justify-center h-7 w-8 hover:bg-slate-200 rounded cursor-pointer relative group">
            <span className="font-bold text-slate-700 border-b-4 border-black pb-0.5 leading-none px-1">
              A
            </span>
          </div>
          <ToolbarBtn
            icon={Highlighter}
            onClick={() => handleNotImplemented("Highlight")}
            tooltip="Highlight color"
          />
        </div>

        <Divider />

        <div className="flex items-center gap-0.5 shrink-0">
          <ToolbarBtn
            icon={Link2}
            onClick={() => handleNotImplemented("Insert Link")}
            tooltip="Insert link"
          />
          <ToolbarBtn
            icon={MessageSquarePlus}
            onClick={() => handleNotImplemented("Add Comment")}
            tooltip="Add comment"
          />
          <ToolbarBtn
            icon={Image}
            onClick={() => handleNotImplemented("Insert Image")}
            tooltip="Insert image"
          />
        </div>

        <Divider />

        <div className="flex items-center gap-0.5 shrink-0">
          <ToolbarBtn
            icon={AlignLeft}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            active={editor.isActive({ textAlign: "left" })}
            tooltip="Left align"
          />
          <ToolbarBtn
            icon={AlignCenter}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            active={editor.isActive({ textAlign: "center" })}
            tooltip="Center align"
          />
          <ToolbarBtn
            icon={AlignRight}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            active={editor.isActive({ textAlign: "right" })}
            tooltip="Right align"
          />
          <ToolbarBtn
            icon={AlignJustify}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            active={editor.isActive({ textAlign: "justify" })}
            tooltip="Justify"
          />
        </div>

        <Divider />

        <div className="flex items-center gap-0.5 shrink-0">
          <ToolbarBtn
            icon={ListOrdered}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            tooltip="Checklist"
          />
          <ToolbarBtn
            icon={List}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            tooltip="Bullet list"
          />
          <ToolbarBtn
            icon={IndentDecrease}
            onClick={() => handleNotImplemented("Decrease Indent")}
            tooltip="Decrease indent"
          />
          <ToolbarBtn
            icon={IndentIncrease}
            onClick={() => handleNotImplemented("Increase Indent")}
            tooltip="Increase indent"
          />
        </div>

        <div className="ml-auto flex items-center pl-2 border-l border-slate-300">
          <div className="flex items-center gap-2 text-xs text-slate-500 px-3 cursor-default select-none">
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                wordCount > 0 ? "bg-green-500 animate-pulse" : "bg-slate-300",
              )}
            />
            <span>Tracking Active</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 px-3 cursor-default select-none border-l border-slate-300 hidden xl:flex">
            <span>{wordCount} words</span>
            <span>{charCount} chars</span>
          </div>
        </div>
      </div>

      {/* Main Flex Layout: Sidebar | Canvas | Companion */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar (Outline) */}
        <div className="hidden xl:block w-60 py-4 pl-4 h-full overflow-y-auto shrink-0 bg-transparent">
          <div className="flex items-center gap-2 mb-4 text-slate-700 font-medium select-none px-2">
            <Menu className="w-4 h-4" />
            <span>Outline</span>
          </div>
          <div className="pl-3 border-l-2 border-slate-200 ml-3 space-y-1">
            {headings.length > 0 ? (
              headings.map((heading, i) => (
                <button
                  key={i}
                  onClick={() => scrollToHeading(heading.pos)}
                  className={cn(
                    "text-xs text-left w-full hover:text-blue-600 py-1 transition-colors truncate block",
                    heading.level === 1
                      ? "font-semibold text-slate-700"
                      : "text-slate-500 pl-2",
                    heading.level === 3 && "pl-4",
                  )}
                >
                  {heading.text || "Untitled"}
                </button>
              ))
            ) : (
              <div className="text-xs text-slate-400 font-medium px-2">
                Headings will appear here.
              </div>
            )}
          </div>
        </div>

        {/* Main Canvas Scroller */}
        <div className="flex-1 overflow-y-auto flex flex-col items-center pb-20 pt-4 bg-[#F9FBFD] scrollbar-thin">
          <div style={{ zoom: zoom / 100 }}>
            {/* Ruler */}
            <div className="w-[816px] h-6 bg-white border-b flex items-end px-[96px] relative mb-4 select-none mx-auto">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 border-l border-slate-300 h-1.5 relative group"
                >
                  <span className="absolute -top-3 -left-1 text-[9px] text-slate-500 opacity-0 group-hover:opacity-100">
                    {i + 1}
                  </span>
                </div>
              ))}
              <div className="absolute left-[96px] bottom-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-blue-500 cursor-ew-resize" />
              <div className="absolute right-[96px] bottom-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-blue-500 cursor-ew-resize" />
            </div>

            {/* Paper */}
            <div className="bg-white w-[816px] min-h-[1056px] shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-slate-200 px-[96px] py-[96px] cursor-text print:shadow-none print:border-none print:w-full mx-auto">
              <EditorContent
                editor={editor}
                className="outline-none h-full [&_.ProseMirror]:min-h-[900px] [&_.ProseMirror]:outline-none text-[11pt] leading-[1.6] [&_p]:mb-4"
              />
            </div>
          </div>
        </div>

        {/* Companion Bar */}
        <div className="hidden 2xl:flex flex-col items-center gap-6 w-14 pt-4 border-l bg-white h-full shrink-0 z-10">
          <div
            className="h-10 w-10 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
            title="Calendar"
          >
            <img
              src="https://www.gstatic.com/companion/icon_assets/calendar_2020q4_2x.png"
              className="w-5 h-5"
              alt="Calendar"
            />
          </div>
          <div
            className="h-10 w-10 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
            title="Keep"
          >
            <img
              src="https://www.gstatic.com/companion/icon_assets/keep_2020q4v3_2x.png"
              className="w-5 h-5"
              alt="Keep"
            />
          </div>
          <div
            className="h-10 w-10 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
            title="Tasks"
          >
            <img
              src="https://www.gstatic.com/companion/icon_assets/tasks_2021_2x.png"
              className="w-5 h-5"
              alt="Tasks"
            />
          </div>
          <div
            className="h-10 w-10 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
            title="Contacts"
          >
            <img
              src="https://www.gstatic.com/companion/icon_assets/contacts_2022_2x.png"
              className="w-5 h-5"
              alt="Contacts"
            />
          </div>
          <div className="w-8 h-px bg-slate-200 my-2" />
          <div className="h-10 w-10 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors">
            <Plus className="w-5 h-5 text-slate-500" />
          </div>
        </div>
        {/* AI Suggestion Overlay */}
        {suggestion && (
          <div className="absolute bottom-8 right-8 bg-white/90 backdrop-blur border border-purple-200 shadow-lg p-4 rounded-xl max-w-sm animate-in fade-in slide-in-from-bottom-2 z-50 ring-1 ring-purple-100">
            <div className="flex items-center gap-2 text-purple-600 font-semibold text-xs mb-1.5 uppercase tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Suggestion</span>
              <span className="ml-auto text-[10px] bg-purple-100 px-1.5 py-0.5 rounded text-purple-700">
                Tab to accept
              </span>
            </div>
            <p className="text-slate-700 text-sm leading-relaxed font-medium">
              ...{suggestion}
            </p>
          </div>
        )}
        {/* Verification Modal */}
        <VerificationModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          sessionId={sessionId}
        />
      </div>
    </div>
  );
}

interface ToolbarBtnProps {
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  tooltip?: string;
  size?: "xs" | "sm";
}

function ToolbarBtn({
  icon: Icon,
  onClick,
  active,
  disabled,
  tooltip,
  size = "sm",
}: ToolbarBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={cn(
        "flex items-center justify-center rounded hover:bg-[#dfe4ea] transition-colors disabled:opacity-30 disabled:hover:bg-transparent",
        size === "xs" ? "w-5 h-5" : "w-7 h-7",
        active && "bg-[#d3e3fd] text-[#0b57d0] hover:bg-[#c2e7ff]",
      )}
    >
      <Icon
        className={cn(
          "text-slate-700",
          size === "xs" ? "w-3 h-3" : "w-4 h-4",
          active && "text-[#0b57d0]",
        )}
      />
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-slate-300 mx-1.5" />;
}
