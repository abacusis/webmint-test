import { HistoryViewer } from '../components/HistoryViewer';

export const meta = () => {
  return [
    { title: "WebMint History - View Your Chat and Deployment History" },
    { name: "description", content: "Browse your local chat history and deployment records in WebMint" },
  ];
};

export default function HistoryPage() {
  return <HistoryViewer />;
}
