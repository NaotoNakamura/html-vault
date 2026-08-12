class RequireBundleOnUserFiles < ActiveRecord::Migration[8.1]
  class MigrationBundle < ActiveRecord::Base
    self.table_name = "bundles"
  end

  class MigrationUserFile < ActiveRecord::Base
    self.table_name = "user_files"
  end

  def up
    MigrationUserFile.where(bundle_id: nil).find_each do |user_file|
      bundle = MigrationBundle.create!(public_id: generate_public_id(MigrationBundle), title: user_file.title)
      user_file.update!(bundle_id: bundle.id)
    end

    change_column_null :user_files, :bundle_id, false
    remove_index :user_files, :public_id
    remove_column :user_files, :public_id, :string
  end

  def down
    add_column :user_files, :public_id, :string
    add_index :user_files, :public_id, unique: true
    change_column_null :user_files, :bundle_id, true

    MigrationUserFile.reset_column_information
    MigrationUserFile.find_each do |user_file|
      user_file.update!(public_id: generate_public_id(MigrationUserFile))
    end
  end

  private

  def generate_public_id(klass)
    loop do
      candidate = SecureRandom.alphanumeric(8)
      break candidate unless klass.exists?(public_id: candidate)
    end
  end
end
