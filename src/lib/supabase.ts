import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:', {
    url: !!supabaseUrl,
    key: !!supabaseAnonKey
  });
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface Dataset {
  id: string;
  user_id: string;
  name: string;
  type: 'train' | 'test' | 'validation';
  description?: string;
  total_images: number;
  class_distribution: Record<string, number>;
  upload_date: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  created_at: string;
  updated_at: string;
}

export interface DatasetImage {
  id: string;
  dataset_id: string;
  filename: string;
  disease_class: string;
  file_path: string;
  file_size: number;
  width?: number;
  height?: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface Model {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  architecture: string;
  training_config: Record<string, any>;
  performance_metrics: Record<string, any>;
  model_file_path?: string;
  status: 'training' | 'completed' | 'failed' | 'deployed';
  created_at: string;
  updated_at: string;
}

export interface TrainingSession {
  id: string;
  model_id: string;
  epoch: number;
  loss: number;
  accuracy: number;
  val_loss: number;
  val_accuracy: number;
  learning_rate: number;
  batch_size: number;
  timestamp: string;
}

export interface Prediction {
  id: string;
  user_id?: string;
  model_id?: string;
  image_filename: string;
  image_path: string;
  predicted_class: string;
  confidence: number;
  all_probabilities: Record<string, number>;
  processing_time: number;
  created_at: string;
}