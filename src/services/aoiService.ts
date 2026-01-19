import { supabase } from '../lib/supabase';

export interface SavedAOI {
  id: string;
  user_id: string;
  config_id?: string;
  name?: string;
  geojson: any;
  drawing_type: string;
  created_at: string;
  updated_at: string;
}

export const saveAOI = async (
  geojson: any,
  configId?: string,
  name?: string
): Promise<SavedAOI | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('⚠️ No user logged in - AOI not saved');
      return null;
    }

    const { data, error } = await supabase
      .from('aoi_boundaries')
      .insert({
        user_id: user.id,
        config_id: configId,
        name: name || `AOI ${new Date().toLocaleString()}`,
        geojson: geojson,
        drawing_type: geojson.properties?.drawingType || 'unknown'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      throw error;
    }
    
    console.log('✅ AOI saved to Supabase:', data);
    return data;
  } catch (error) {
    console.error('❌ Error saving AOI:', error);
    return null;
  }
};

export const getUserAOIs = async (configId?: string): Promise<SavedAOI[]> => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.log('⚠️ No user logged in or auth error:', authError);
      return [];
    }

    // Check if user is admin first
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    let query = supabase
      .from('aoi_boundaries')
      .select('*')
      .order('created_at', { ascending: false });

    // Regular users: filter by user_id (RLS already restricts)
    if (!profile?.is_admin) {
      query = query.eq('user_id', user.id);
    }
    // Admin: no user_id filter - RLS returns ALL boundaries

    if (configId) {
      query = query.eq('config_id', configId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Supabase error:', error);
      throw error;
    }
    
    console.log(`✅ Loaded ${data?.length || 0} AOIs for ${profile?.is_admin ? 'ADMIN (ALL)' : 'user'} ${user.id}`);
    return data || [];
  } catch (error) {
    console.error('❌ Error loading AOIs:', error);
    return [];
  }
};

export const deleteAOI = async (aoiId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('aoi_boundaries')
      .delete()
      .eq('id', aoiId);

    if (error) {
      console.error('❌ Supabase error:', error);
      throw error;
    }
    
    console.log('✅ AOI deleted from Supabase:', aoiId);
    return true;
  } catch (error) {
    console.error('❌ Error deleting AOI:', error);
    return false;
  }
};

export const deleteAllUserAOIs = async (): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('⚠️ No user logged in');
      return false;
    }

    const { error } = await supabase
      .from('aoi_boundaries')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error('❌ Supabase error:', error);
      throw error;
    }
    
    console.log('✅ All user AOIs deleted from Supabase');
    return true;
  } catch (error) {
    console.error('❌ Error deleting all AOIs:', error);
    return false;
  }
};

export const updateAOIName = async (
  aoiId: string,
  newName: string
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('aoi_boundaries')
      .update({ name: newName, updated_at: new Date().toISOString() })
      .eq('id', aoiId);

    if (error) {
      console.error('❌ Supabase error:', error);
      throw error;
    }
    
    console.log('✅ AOI name updated:', aoiId);
    return true;
  } catch (error) {
    console.error('❌ Error updating AOI name:', error);
    return false;
  }
};
